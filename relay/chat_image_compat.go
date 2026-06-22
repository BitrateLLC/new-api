package relay

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	relayhelper "github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

const (
	chatImageCompatibilityModel               = "gpt-image-2"
	chatImageCompatibilityContextKey          = "chat_image_compat"
	chatImageCompatibilitySkipImagePersistKey = "chat_image_compat_skip_image_persist"
)

func ShouldUseChatImageCompatibility(c *gin.Context, request *dto.GeneralOpenAIRequest) bool {
	if c == nil || c.Request == nil || request == nil {
		return false
	}
	if relayconstant.Path2RelayMode(c.Request.URL.Path) != relayconstant.RelayModeChatCompletions {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(request.Model), chatImageCompatibilityModel)
}

func ConvertChatCompletionsToImageRequest(request *dto.GeneralOpenAIRequest) (*dto.ImageRequest, error) {
	if request == nil {
		return nil, fmt.Errorf("request is nil")
	}
	prompt := extractChatImagePrompt(request)
	if prompt == "" {
		return nil, fmt.Errorf("gpt-image-2 chat compatibility requires a non-empty user message")
	}

	imageReq := &dto.ImageRequest{
		Model:  request.Model,
		Prompt: prompt,
		Size:   request.Size,
		// gpt-image-2 不接受 response_format（固定返回 b64_json），不要设置，
		// 否则透传到官方会报 "Unknown parameter: 'response_format'."。
		Stream: common.GetPointer(true),
	}
	n := uint(1)
	if request.N != nil && *request.N > 0 {
		n = uint(*request.N)
	}
	imageReq.N = &n
	return imageReq, nil
}

func ReplaceChatImageCompatibilityRequestBody(c *gin.Context, request *dto.ImageRequest) error {
	if c == nil || c.Request == nil || request == nil {
		return nil
	}
	body, err := common.Marshal(request)
	if err != nil {
		return err
	}
	if oldStorage, exists := c.Get(common.KeyBodyStorage); exists && oldStorage != nil {
		if bs, ok := oldStorage.(common.BodyStorage); ok {
			_ = bs.Close()
		}
	}
	storage, err := common.CreateBodyStorage(body)
	if err != nil {
		return err
	}
	c.Set(common.KeyBodyStorage, storage)
	_, _ = storage.Seek(0, io.SeekStart)
	c.Request.Body = io.NopCloser(storage)
	c.Request.ContentLength = int64(len(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return nil
}

func PrepareChatImageCompatibilityRelayInfo(info *relaycommon.RelayInfo) {
	if info == nil {
		return
	}
	info.RelayMode = relayconstant.RelayModeImagesGenerations
	info.RelayFormat = types.RelayFormatOpenAIImage
	info.RequestURLPath = "/v1/images/generations"
	info.IsStream = true
	info.DisablePing = true
}

func ChatImageCompatibilityHelper(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	if c == nil || info == nil {
		return types.NewErrorWithStatusCode(fmt.Errorf("invalid chat image compatibility context"), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	if !c.GetBool("chat_image_compat_stream") {
		return chatImageCompatibilityJSONHelper(c, info)
	}

	originalWriter := c.Writer
	streamWriter := &chatImageCompatibilityStreamWriter{
		ResponseWriter: originalWriter,
		c:              c,
		info:           info,
		taskID:         model.GenerateTaskID(),
	}
	c.Writer = streamWriter

	c.Set(chatImageCompatibilityContextKey, true)
	c.Set(chatImageCompatibilitySkipImagePersistKey, true)
	apiErr := ImageHelper(c, info)
	c.Writer = originalWriter
	if apiErr != nil {
		if streamWriter.Started() {
			writeChatImageCompatibilityStreamErrorToWriter(originalWriter, c, info, apiErr)
			return nil
		}
		return apiErr
	}
	streamWriter.FlushPending()
	if streamWriter.err != nil {
		apiErr = types.NewErrorWithStatusCode(streamWriter.err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError, types.ErrOptionWithSkipRetry())
		if streamWriter.Started() {
			writeChatImageCompatibilityStreamErrorToWriter(originalWriter, c, info, apiErr)
			return nil
		}
		return apiErr
	}
	if streamWriter.completedCount == 0 {
		return types.NewErrorWithStatusCode(fmt.Errorf("image stream completed without image_generation.completed event"), types.ErrorCodeBadResponseBody, http.StatusInternalServerError, types.ErrOptionWithSkipRetry())
	}
	streamWriter.Finish()
	return nil
}

func chatImageCompatibilityJSONHelper(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	originalWriter := c.Writer
	jsonWriter := &chatImageCompatibilityJSONWriter{
		ResponseWriter: originalWriter,
		c:              c,
		info:           info,
		taskID:         model.GenerateTaskID(),
		statusCode:     http.StatusOK,
		imageResp: dto.ImageResponse{
			Created: time.Now().Unix(),
			Data:    make([]dto.ImageData, 0),
		},
	}
	c.Writer = jsonWriter

	c.Set(chatImageCompatibilityContextKey, true)
	c.Set(chatImageCompatibilitySkipImagePersistKey, true)
	apiErr := ImageHelper(c, info)
	c.Writer = originalWriter
	if apiErr != nil {
		if jsonWriter.Started() {
			jsonWriter.WriteError(apiErr)
			return nil
		}
		return apiErr
	}
	jsonWriter.FlushPending()
	if jsonWriter.err != nil {
		apiErr = types.NewErrorWithStatusCode(jsonWriter.err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError, types.ErrOptionWithSkipRetry())
		if jsonWriter.Started() {
			jsonWriter.WriteError(apiErr)
			return nil
		}
		return apiErr
	}
	if jsonWriter.completedCount == 0 {
		return types.NewErrorWithStatusCode(fmt.Errorf("image stream completed without image_generation.completed event"), types.ErrorCodeBadResponseBody, http.StatusInternalServerError, types.ErrOptionWithSkipRetry())
	}
	if err := jsonWriter.Finish(); err != nil {
		return types.NewErrorWithStatusCode(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError, types.ErrOptionWithSkipRetry())
	}
	return nil
}

func persistChatImageCompatibilityResponse(ctx context.Context, imageResp *dto.ImageResponse) (*dto.ImageResponse, error) {
	return service.PersistImageResponseToStorage(ctx, model.GenerateTaskID(), imageResp)
}

type chatImageCompatibilityStreamWriter struct {
	gin.ResponseWriter
	c              *gin.Context
	info           *relaycommon.RelayInfo
	taskID         string
	pending        bytes.Buffer
	statusCode     int
	roleSent       bool
	doneSent       bool
	imageURLs      []string
	completedCount int
	logCreated     bool
	err            error
}

type chatImageCompatibilityJSONWriter struct {
	gin.ResponseWriter
	c              *gin.Context
	info           *relaycommon.RelayInfo
	taskID         string
	pending        bytes.Buffer
	statusCode     int
	headerWritten  bool
	imageResp      dto.ImageResponse
	usage          dto.Usage
	hasUsage       bool
	imageURLs      []string
	completedCount int
	logCreated     bool
	err            error
}

func (w *chatImageCompatibilityStreamWriter) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *chatImageCompatibilityJSONWriter) WriteHeader(code int) {
	w.statusCode = code
}

func (w *chatImageCompatibilityStreamWriter) Write(data []byte) (int, error) {
	if len(data) > 0 {
		_, _ = w.pending.WriteString(strings.ReplaceAll(string(data), "\r\n", "\n"))
		w.processPendingFrames()
	}
	return len(data), w.err
}

func (w *chatImageCompatibilityStreamWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

func (w *chatImageCompatibilityJSONWriter) Write(data []byte) (int, error) {
	if len(data) > 0 {
		_, _ = w.pending.WriteString(strings.ReplaceAll(string(data), "\r\n", "\n"))
		w.processPendingFrames()
	}
	return len(data), w.err
}

func (w *chatImageCompatibilityJSONWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

func (w *chatImageCompatibilityStreamWriter) Started() bool {
	return w != nil && (w.statusCode != 0 || w.roleSent || w.doneSent)
}

func (w *chatImageCompatibilityJSONWriter) Started() bool {
	return w != nil && w.headerWritten
}

func (w *chatImageCompatibilityStreamWriter) FlushPending() {
	if w == nil || w.err != nil {
		return
	}
	body := strings.TrimSpace(w.pending.String())
	if body == "" {
		return
	}
	w.pending.Reset()
	if strings.HasPrefix(body, ":") {
		if err := w.writeRawSSEFrame(body); err != nil {
			w.err = err
		}
		return
	}
	if body == "[DONE]" || body == "data: [DONE]" {
		return
	}

	var imageResp dto.ImageResponse
	if err := common.Unmarshal([]byte(body), &imageResp); err != nil {
		w.err = fmt.Errorf("parse image stream tail: %w", err)
		return
	}
	storedResp, err := persistChatImageCompatibilityResponse(w.c.Request.Context(), &imageResp)
	if err != nil {
		w.err = err
		return
	}
	if storedResp != nil {
		imageResp = *storedResp
	}
	w.imageURLs = append(w.imageURLs, imageURLsFromImageResponse(&imageResp)...)
	content := chatImageCompatibilityContent(imageResp)
	if content == "" {
		w.err = fmt.Errorf("image response contains no image data")
		return
	}
	if err := w.writeChatContent(content); err != nil {
		w.err = err
		return
	}
	w.completedCount++
}

func (w *chatImageCompatibilityJSONWriter) FlushPending() {
	if w == nil || w.err != nil {
		return
	}
	body := strings.TrimSpace(w.pending.String())
	if body == "" {
		return
	}
	w.pending.Reset()
	if strings.HasPrefix(body, ":") {
		w.writeKeepAlive()
		return
	}
	if body == "[DONE]" || body == "data: [DONE]" {
		return
	}

	var imageResp dto.ImageResponse
	if err := common.Unmarshal([]byte(body), &imageResp); err != nil {
		w.err = fmt.Errorf("parse image stream tail: %w", err)
		return
	}
	storedResp, err := persistChatImageCompatibilityResponse(w.c.Request.Context(), &imageResp)
	if err != nil {
		w.err = err
		return
	}
	if storedResp != nil {
		imageResp = *storedResp
	}
	w.imageResp.Data = append(w.imageResp.Data, imageResp.Data...)
	w.imageURLs = append(w.imageURLs, imageURLsFromImageResponse(&imageResp)...)
	w.completedCount += len(imageResp.Data)
}

func (w *chatImageCompatibilityStreamWriter) Finish() {
	if w == nil || w.doneSent || !w.roleSent {
		return
	}
	now := time.Now().Unix()
	id := relayhelper.GetResponseID(w.c)
	modelName := w.info.OriginModelName
	stopChunk := dto.ChatCompletionsStreamResponse{
		Id:      id,
		Object:  "chat.completion.chunk",
		Created: now,
		Model:   modelName,
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{
				Index:        0,
				FinishReason: &constant.FinishReasonStop,
				Delta:        dto.ChatCompletionsStreamResponseChoiceDelta{},
			},
		},
	}
	_ = writeChatImageCompatibilityObjectToWriter(w.ResponseWriter, stopChunk)
	_, _ = w.ResponseWriter.Write([]byte("data: [DONE]\n\n"))
	flushChatImageCompatibilityWriter(w.ResponseWriter)
	w.doneSent = true
	w.createLog()
}

func (w *chatImageCompatibilityJSONWriter) Finish() error {
	if w == nil {
		return nil
	}
	content := chatImageCompatibilityContent(w.imageResp)
	if content == "" {
		return fmt.Errorf("image response contains no image url")
	}
	usage := w.usage
	if !w.hasUsage {
		usage = dto.Usage{PromptTokens: 1, CompletionTokens: 1, TotalTokens: 2, InputTokens: 1, OutputTokens: 1}
	}
	response := dto.OpenAITextResponse{
		Id:      relayhelper.GetResponseID(w.c),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   w.info.OriginModelName,
		Choices: []dto.OpenAITextResponseChoice{
			{
				Index: 0,
				Message: dto.Message{
					Role:    "assistant",
					Content: content,
				},
				FinishReason: constant.FinishReasonStop,
			},
		},
		Usage: usage,
	}
	body, err := common.Marshal(response)
	if err != nil {
		return err
	}
	w.prepareJSONHeaders()
	if !w.headerWritten {
		w.ResponseWriter.WriteHeader(w.responseStatusCode())
		w.headerWritten = true
	}
	if _, err := w.ResponseWriter.Write(body); err != nil {
		return err
	}
	flushChatImageCompatibilityWriter(w.ResponseWriter)
	w.createLog()
	return nil
}

func (w *chatImageCompatibilityStreamWriter) processPendingFrames() {
	for w.err == nil {
		pending := w.pending.String()
		idx := strings.Index(pending, "\n\n")
		if idx < 0 {
			return
		}
		frame := pending[:idx]
		rest := pending[idx+2:]
		w.pending.Reset()
		_, _ = w.pending.WriteString(rest)
		if err := w.handleSSEFrame(frame); err != nil {
			w.err = err
			return
		}
	}
}

func (w *chatImageCompatibilityJSONWriter) processPendingFrames() {
	for w.err == nil {
		pending := w.pending.String()
		idx := strings.Index(pending, "\n\n")
		if idx < 0 {
			return
		}
		frame := pending[:idx]
		rest := pending[idx+2:]
		w.pending.Reset()
		_, _ = w.pending.WriteString(rest)
		if err := w.handleSSEFrame(frame); err != nil {
			w.err = err
			return
		}
	}
}

func (w *chatImageCompatibilityStreamWriter) handleSSEFrame(frame string) error {
	trimmed := strings.TrimSpace(frame)
	if trimmed == "" {
		return nil
	}
	if strings.HasPrefix(trimmed, ":") {
		return w.writeRawSSEFrame(frame)
	}

	eventName, data := parseChatImageCompatibilitySSEFrame(frame)
	if strings.TrimSpace(data) == "" || strings.TrimSpace(data) == "[DONE]" {
		return nil
	}

	var payload map[string]interface{}
	if err := common.Unmarshal([]byte(data), &payload); err != nil {
		return w.writeRawSSEFrame(frame)
	}
	payloadType, _ := payload["type"].(string)
	if isChatImageCompatibilityPartialEvent(eventName, payloadType) {
		return nil
	}
	if !isChatImageCompatibilityCompletedEvent(eventName, payloadType) {
		if isChatImageCompatibilityKeepAliveEvent(eventName, payloadType) {
			return w.writeRawSSEFrame(frame)
		}
		return nil
	}

	url, err := persistChatImageCompatibilityCompletedPayload(w.c.Request.Context(), fmt.Sprintf("%s-%d", w.taskID, w.completedCount), payload)
	if err != nil {
		return err
	}
	w.imageURLs = append(w.imageURLs, url)
	content := fmt.Sprintf("![generated image](%s)", url)
	if w.completedCount > 0 {
		content = fmt.Sprintf("\n\n![generated image %d](%s)", w.completedCount+1, url)
	}
	if err := w.writeChatContent(content); err != nil {
		return err
	}
	w.completedCount++
	return nil
}

func (w *chatImageCompatibilityJSONWriter) handleSSEFrame(frame string) error {
	trimmed := strings.TrimSpace(frame)
	if trimmed == "" {
		return nil
	}
	if strings.HasPrefix(trimmed, ":") {
		w.writeKeepAlive()
		return nil
	}

	eventName, data := parseChatImageCompatibilitySSEFrame(frame)
	if strings.TrimSpace(data) == "" || strings.TrimSpace(data) == "[DONE]" {
		return nil
	}

	var payload map[string]interface{}
	if err := common.Unmarshal([]byte(data), &payload); err != nil {
		return err
	}
	payloadType, _ := payload["type"].(string)
	if isChatImageCompatibilityPartialEvent(eventName, payloadType) {
		return nil
	}
	if !isChatImageCompatibilityCompletedEvent(eventName, payloadType) {
		if isChatImageCompatibilityKeepAliveEvent(eventName, payloadType) {
			w.writeKeepAlive()
		}
		return nil
	}

	url, err := persistChatImageCompatibilityCompletedPayload(w.c.Request.Context(), fmt.Sprintf("%s-%d", w.taskID, w.completedCount), payload)
	if err != nil {
		return err
	}
	w.imageResp.Data = append(w.imageResp.Data, dto.ImageData{Url: url})
	w.imageURLs = append(w.imageURLs, url)
	w.completedCount++
	if usage, ok := chatImageCompatibilityUsageFromPayload(payload); ok {
		w.usage = *usage
		w.hasUsage = true
	}
	return nil
}

func (w *chatImageCompatibilityStreamWriter) writeRawSSEFrame(frame string) error {
	if _, err := w.ResponseWriter.Write([]byte(frame + "\n\n")); err != nil {
		return err
	}
	flushChatImageCompatibilityWriter(w.ResponseWriter)
	return nil
}

func (w *chatImageCompatibilityStreamWriter) persistCompletedPayload(payload map[string]interface{}) (string, error) {
	return persistChatImageCompatibilityCompletedPayload(w.c.Request.Context(), w.taskID, payload)
}

func (w *chatImageCompatibilityStreamWriter) createLog() {
	if w == nil || w.logCreated {
		return
	}
	w.logCreated = true
	createChatImageCompatibilityLog(w.c, w.info, w.taskID, w.imageURLs)
}

func (w *chatImageCompatibilityJSONWriter) createLog() {
	if w == nil || w.logCreated {
		return
	}
	w.logCreated = true
	createChatImageCompatibilityLog(w.c, w.info, w.taskID, w.imageURLs)
}

func (w *chatImageCompatibilityStreamWriter) writeChatContent(content string) error {
	if !w.roleSent {
		now := time.Now().Unix()
		roleChunk := dto.ChatCompletionsStreamResponse{
			Id:      relayhelper.GetResponseID(w.c),
			Object:  "chat.completion.chunk",
			Created: now,
			Model:   w.info.OriginModelName,
			Choices: []dto.ChatCompletionsStreamResponseChoice{
				{
					Index: 0,
					Delta: dto.ChatCompletionsStreamResponseChoiceDelta{Role: "assistant"},
				},
			},
		}
		if err := writeChatImageCompatibilityObjectToWriter(w.ResponseWriter, roleChunk); err != nil {
			return err
		}
		w.roleSent = true
	}
	now := time.Now().Unix()
	contentChunk := dto.ChatCompletionsStreamResponse{
		Id:      relayhelper.GetResponseID(w.c),
		Object:  "chat.completion.chunk",
		Created: now,
		Model:   w.info.OriginModelName,
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{
				Index: 0,
				Delta: dto.ChatCompletionsStreamResponseChoiceDelta{Content: &content},
			},
		},
	}
	return writeChatImageCompatibilityObjectToWriter(w.ResponseWriter, contentChunk)
}

func parseChatImageCompatibilitySSEFrame(frame string) (eventName string, data string) {
	dataLines := make([]string, 0)
	for _, line := range strings.Split(strings.ReplaceAll(frame, "\r\n", "\n"), "\n") {
		line = strings.TrimRight(line, "\r")
		switch {
		case strings.HasPrefix(line, "event:"):
			eventName = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	return eventName, strings.Join(dataLines, "\n")
}

func isChatImageCompatibilityPartialEvent(eventName string, payloadType string) bool {
	eventName = strings.ToLower(strings.TrimSpace(eventName))
	payloadType = strings.ToLower(strings.TrimSpace(payloadType))
	return strings.Contains(eventName, "partial_image") || strings.Contains(payloadType, "partial_image")
}

func isChatImageCompatibilityCompletedEvent(eventName string, payloadType string) bool {
	eventName = strings.ToLower(strings.TrimSpace(eventName))
	payloadType = strings.ToLower(strings.TrimSpace(payloadType))
	return strings.HasSuffix(eventName, ".completed") ||
		strings.HasSuffix(payloadType, ".completed") ||
		eventName == "image_generation.completed" ||
		payloadType == "image_generation.completed"
}

func isChatImageCompatibilityKeepAliveEvent(eventName string, payloadType string) bool {
	eventName = strings.ToLower(strings.TrimSpace(eventName))
	payloadType = strings.ToLower(strings.TrimSpace(payloadType))
	return strings.Contains(eventName, "keep-alive") ||
		strings.Contains(eventName, "heartbeat") ||
		strings.Contains(eventName, "ping") ||
		strings.Contains(payloadType, "keep-alive") ||
		strings.Contains(payloadType, "heartbeat") ||
		strings.Contains(payloadType, "ping")
}

func writeChatImageCompatibilityObjectToWriter(writer gin.ResponseWriter, object interface{}) error {
	jsonData, err := common.Marshal(object)
	if err != nil {
		return err
	}
	if _, err := writer.Write([]byte("data: " + string(jsonData) + "\n\n")); err != nil {
		return err
	}
	flushChatImageCompatibilityWriter(writer)
	return nil
}

func writeChatImageCompatibilityStreamErrorToWriter(writer gin.ResponseWriter, c *gin.Context, info *relaycommon.RelayInfo, apiErr *types.NewAPIError) {
	if info != nil && info.Billing != nil {
		info.Billing.Refund(c)
	}
	if apiErr != nil {
		_ = writeChatImageCompatibilityObjectToWriter(writer, gin.H{
			"error": apiErr.ToOpenAIError(),
		})
	}
	_, _ = writer.Write([]byte("data: [DONE]\n\n"))
	flushChatImageCompatibilityWriter(writer)
}

func (w *chatImageCompatibilityJSONWriter) WriteError(apiErr *types.NewAPIError) {
	if w == nil || apiErr == nil {
		return
	}
	if w.info != nil && w.info.Billing != nil {
		w.info.Billing.Refund(w.c)
	}
	w.prepareJSONHeaders()
	if !w.headerWritten {
		statusCode := apiErr.StatusCode
		if statusCode <= 0 {
			statusCode = http.StatusInternalServerError
		}
		w.ResponseWriter.WriteHeader(statusCode)
		w.headerWritten = true
	}
	body, err := common.Marshal(gin.H{"error": apiErr.ToOpenAIError()})
	if err == nil {
		_, _ = w.ResponseWriter.Write(body)
	}
	flushChatImageCompatibilityWriter(w.ResponseWriter)
}

func (w *chatImageCompatibilityJSONWriter) writeKeepAlive() {
	if w == nil {
		return
	}
	w.prepareJSONHeaders()
	if !w.headerWritten {
		w.ResponseWriter.WriteHeader(w.responseStatusCode())
		w.headerWritten = true
	}
	_, _ = w.ResponseWriter.Write([]byte("\n"))
	flushChatImageCompatibilityWriter(w.ResponseWriter)
}

func (w *chatImageCompatibilityJSONWriter) prepareJSONHeaders() {
	header := w.ResponseWriter.Header()
	header.Set("Content-Type", "application/json")
	header.Set("Cache-Control", "no-cache")
	header.Set("X-Accel-Buffering", "no")
	header.Del("Content-Length")
}

func (w *chatImageCompatibilityJSONWriter) responseStatusCode() int {
	if w == nil || w.statusCode <= 0 {
		return http.StatusOK
	}
	return w.statusCode
}

func persistChatImageCompatibilityCompletedPayload(ctx context.Context, taskID string, payload map[string]interface{}) (string, error) {
	if payload == nil {
		return "", fmt.Errorf("empty image_generation.completed payload")
	}
	if url, _ := payload["url"].(string); strings.TrimSpace(url) != "" {
		storedResp, err := service.PersistImageResponseToStorage(ctx, taskID, &dto.ImageResponse{
			Data: []dto.ImageData{{Url: strings.TrimSpace(url)}},
		})
		if err != nil {
			return "", err
		}
		if storedResp != nil && len(storedResp.Data) > 0 && strings.TrimSpace(storedResp.Data[0].Url) != "" {
			url = strings.TrimSpace(storedResp.Data[0].Url)
		}
		payload["url"] = url
		return strings.TrimSpace(url), nil
	}
	b64, _ := payload["b64_json"].(string)
	if strings.TrimSpace(b64) == "" {
		return "", fmt.Errorf("image_generation.completed payload contains no b64_json or url")
	}
	storedResp, err := service.PersistImageResponseToStorage(ctx, taskID, &dto.ImageResponse{
		Data: []dto.ImageData{{B64Json: strings.TrimSpace(b64)}},
	})
	if err != nil {
		return "", err
	}
	if storedResp == nil || len(storedResp.Data) == 0 || strings.TrimSpace(storedResp.Data[0].Url) == "" {
		return "", fmt.Errorf("image storage did not return public url")
	}
	url := strings.TrimSpace(storedResp.Data[0].Url)
	payload["url"] = url
	delete(payload, "b64_json")
	return url, nil
}

func createChatImageCompatibilityLog(c *gin.Context, info *relaycommon.RelayInfo, taskID string, imageURLs []string) {
	if c == nil || info == nil || taskID == "" {
		return
	}
	request, _ := info.Request.(*dto.ImageRequest)
	now := time.Now().Unix()
	log := &model.ImageGenerationLog{
		CreatedAt:  now,
		UpdatedAt:  now,
		FinishedAt: now,
		UserId:     info.UserId,
		TokenId:    info.TokenId,
		TokenName:  c.GetString("token_name"),
		TaskID:     taskID,
		Action:     "image_generation",
		Model:      info.OriginModelName,
		Status:     model.TaskStatusSuccess,
	}
	if request != nil {
		log.Model = request.Model
		log.Prompt = request.Prompt
	}
	log.SetImageURLs(imageURLs)
	if err := model.CreateImageGenerationLog(log); err != nil {
		logger.LogError(context.Background(), fmt.Sprintf("create chat image compatibility log failed: %s", err.Error()))
	}
}

func chatImageCompatibilityUsageFromPayload(payload map[string]interface{}) (*dto.Usage, bool) {
	rawUsage, ok := payload["usage"]
	if !ok {
		return nil, false
	}
	usageBytes, err := common.Marshal(rawUsage)
	if err != nil {
		return nil, false
	}
	var usage dto.Usage
	if err := common.Unmarshal(usageBytes, &usage); err != nil {
		return nil, false
	}
	normalizeImageUsageForLog(&usage)
	return &usage, service.ValidUsage(&usage)
}

func flushChatImageCompatibilityWriter(writer gin.ResponseWriter) {
	if flusher, ok := writer.(http.Flusher); ok {
		flusher.Flush()
	}
}

func extractChatImagePrompt(request *dto.GeneralOpenAIRequest) string {
	for i := len(request.Messages) - 1; i >= 0; i-- {
		message := request.Messages[i]
		if message.Role != "user" {
			continue
		}
		if content := strings.TrimSpace(message.StringContent()); content != "" {
			return content
		}
		for _, item := range message.ParseContent() {
			if item.Type == dto.ContentTypeText && strings.TrimSpace(item.Text) != "" {
				return strings.TrimSpace(item.Text)
			}
		}
	}
	if prompt, ok := request.Prompt.(string); ok {
		return strings.TrimSpace(prompt)
	}
	return ""
}

func chatImageCompatibilityContent(resp dto.ImageResponse) string {
	parts := make([]string, 0, len(resp.Data))
	for i, item := range resp.Data {
		image := strings.TrimSpace(item.Url)
		if image == "" {
			continue
		}
		alt := "generated image"
		if len(resp.Data) > 1 {
			alt = fmt.Sprintf("generated image %d", i+1)
		}
		parts = append(parts, fmt.Sprintf("![%s](%s)", alt, image))
	}
	return strings.Join(parts, "\n\n")
}
