package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/dto"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
)

type ImageStorageConfig struct {
	Endpoint      string
	Bucket        string
	AccessKey     string
	SecretKey     string
	Region        string
	PublicBaseURL string
	PathPrefix    string
}

func LoadImageStorageConfig() ImageStorageConfig {
	return ImageStorageConfig{
		Endpoint:      strings.TrimSpace(os.Getenv("IMAGE_STORAGE_R2_ENDPOINT")),
		Bucket:        strings.Trim(strings.TrimSpace(os.Getenv("IMAGE_STORAGE_R2_BUCKET")), "/"),
		AccessKey:     strings.TrimSpace(os.Getenv("IMAGE_STORAGE_R2_ACCESS_KEY")),
		SecretKey:     strings.TrimSpace(os.Getenv("IMAGE_STORAGE_R2_SECRET_KEY")),
		Region:        strings.TrimSpace(os.Getenv("IMAGE_STORAGE_R2_REGION")),
		PublicBaseURL: strings.TrimRight(strings.TrimSpace(os.Getenv("IMAGE_STORAGE_R2_PUBLIC_BASE_URL")), "/"),
		PathPrefix:    strings.Trim(strings.TrimSpace(os.Getenv("IMAGE_STORAGE_R2_PATH_PREFIX")), "/"),
	}
}

func (c ImageStorageConfig) Enabled() bool {
	return c.Endpoint != "" && c.Bucket != "" && c.AccessKey != "" && c.SecretKey != "" && c.PublicBaseURL != ""
}

func (c ImageStorageConfig) normalize() ImageStorageConfig {
	if c.Region == "" {
		c.Region = "auto"
	}
	c.Endpoint = strings.TrimRight(c.Endpoint, "/")
	return c
}

func PersistImageResponseToStorage(ctx context.Context, taskID string, imageResp *dto.ImageResponse) (*dto.ImageResponse, error) {
	if imageResp == nil {
		return nil, fmt.Errorf("image response is nil")
	}
	cfg := LoadImageStorageConfig().normalize()
	if !cfg.Enabled() {
		return imageResp, nil
	}
	out := *imageResp
	out.Data = make([]dto.ImageData, 0, len(imageResp.Data))
	for i, item := range imageResp.Data {
		next := item
		raw, contentType, ext, ok, err := imageDataBytes(item)
		if err != nil {
			return nil, err
		}
		if ok {
			objectKey := imageObjectKey(cfg.PathPrefix, taskID, i, ext)
			publicURL, err := putR2Object(ctx, cfg, objectKey, contentType, raw)
			if err != nil {
				return nil, err
			}
			next.Url = publicURL
			next.B64Json = ""
		}
		out.Data = append(out.Data, next)
	}
	return &out, nil
}

func imageDataBytes(item dto.ImageData) ([]byte, string, string, bool, error) {
	value := strings.TrimSpace(item.B64Json)
	if value != "" {
		raw, err := decodeBase64Payload(value)
		if err != nil {
			return nil, "", "", false, err
		}
		contentType := http.DetectContentType(raw)
		return raw, normalizeImageContentType(contentType), extensionFromContentType(contentType), true, nil
	}
	value = strings.TrimSpace(item.Url)
	if !strings.HasPrefix(value, "data:image/") {
		return nil, "", "", false, nil
	}
	comma := strings.Index(value, ",")
	if comma < 0 {
		return nil, "", "", false, fmt.Errorf("invalid data image url")
	}
	meta := value[:comma]
	raw, err := decodeBase64Payload(value[comma+1:])
	if err != nil {
		return nil, "", "", false, err
	}
	contentType := "image/png"
	if strings.HasPrefix(meta, "data:") {
		if semi := strings.Index(meta, ";"); semi > len("data:") {
			contentType = meta[len("data:"):semi]
		}
	}
	return raw, normalizeImageContentType(contentType), extensionFromContentType(contentType), true, nil
}

func decodeBase64Payload(value string) ([]byte, error) {
	if comma := strings.Index(value, ","); comma >= 0 {
		value = value[comma+1:]
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, fmt.Errorf("empty base64 image data")
	}
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		raw, err = base64.RawStdEncoding.DecodeString(value)
	}
	if err != nil {
		return nil, fmt.Errorf("decode image base64: %w", err)
	}
	return raw, nil
}

func normalizeImageContentType(contentType string) string {
	contentType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if !strings.HasPrefix(contentType, "image/") {
		return "image/png"
	}
	return contentType
}

func extensionFromContentType(contentType string) string {
	contentType = normalizeImageContentType(contentType)
	if exts, err := mime.ExtensionsByType(contentType); err == nil && len(exts) > 0 {
		return strings.TrimPrefix(exts[0], ".")
	}
	switch contentType {
	case "image/jpeg":
		return "jpg"
	case "image/webp":
		return "webp"
	default:
		return "png"
	}
}

func imageObjectKey(prefix string, taskID string, index int, ext string) string {
	datePath := time.Now().Format("2006/01/02")
	fileName := fmt.Sprintf("%s-%d.%s", taskID, index, ext)
	if prefix == "" {
		return path.Join("image-generations", datePath, fileName)
	}
	return path.Join(prefix, datePath, fileName)
}

func putR2Object(ctx context.Context, cfg ImageStorageConfig, objectKey string, contentType string, data []byte) (string, error) {
	endpoint, err := url.Parse(cfg.Endpoint)
	if err != nil {
		return "", fmt.Errorf("invalid R2 endpoint: %w", err)
	}
	endpoint.Path = path.Join(endpoint.Path, cfg.Bucket, objectKey)
	requestURL := endpoint.String()
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, requestURL, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Content-Length", fmt.Sprintf("%d", len(data)))
	req.ContentLength = int64(len(data))

	sum := sha256.Sum256(data)
	payloadHash := hex.EncodeToString(sum[:])
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	creds := aws.Credentials{
		AccessKeyID:     cfg.AccessKey,
		SecretAccessKey: cfg.SecretKey,
	}
	signer := v4.NewSigner()
	if err := signer.SignHTTP(ctx, creds, req, payloadHash, "s3", cfg.Region, time.Now()); err != nil {
		return "", fmt.Errorf("sign R2 upload: %w", err)
	}
	resp, err := GetHttpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("upload R2 object: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("upload R2 object failed: HTTP %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return cfg.PublicBaseURL + "/" + strings.TrimLeft(objectKey, "/"), nil
}
