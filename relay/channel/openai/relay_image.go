package openai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

func updateOpenAIImageCount(info *relaycommon.RelayInfo, count int64) {
	if info == nil || !info.PriceData.UsePrice || count <= 0 || count > int64(dto.MaxImageN) {
		return
	}
	info.PriceData.AddOtherRatio("n", float64(count))
}

// OpenaiImageHandler handles non-streaming OpenAI image responses
// (generations/edits), returning the parsed usage for billing.
func OpenaiImageHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}

	var usageResp dto.SimpleResponse
	err = common.Unmarshal(responseBody, &usageResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	if oaiError := usageResp.GetOpenAIError(); oaiError != nil && oaiError.Type != "" {
		return nil, types.WithOpenAIError(*oaiError, resp.StatusCode)
	}

	updateOpenAIImageCount(info, gjson.GetBytes(responseBody, "data.#").Int())

	// 写入新的 response body
	service.IOCopyBytesGracefully(c, resp, responseBody)

	normalizeOpenAIUsage(&usageResp.Usage)
	applyUsagePostProcessing(info, &usageResp.Usage, responseBody)
	return &usageResp.Usage, nil
}

// normalizeOpenAIUsage maps the OpenAI Images usage shape (input_tokens /
// output_tokens / input_tokens_details) onto the canonical prompt/completion
// fields. It is used only on the OpenAI image relay paths (generations/edits,
// streaming and non-streaming): the image API never returns prompt_tokens /
// completion_tokens, so the overwrite (=) semantics here are equivalent to the
// previous additive (+=) behavior while avoiding any future double-counting if
// both field sets are ever populated. Do not reuse this on chat/embedding paths
// without revisiting the overwrite semantics.
func normalizeOpenAIUsage(usage *dto.Usage) {
	if usage == nil {
		return
	}
	if usage.InputTokens != 0 {
		usage.PromptTokens = usage.InputTokens
	}
	if usage.OutputTokens != 0 {
		usage.CompletionTokens = usage.OutputTokens
	}
	if usage.InputTokensDetails != nil {
		usage.PromptTokensDetails.CachedTokens = usage.InputTokensDetails.CachedTokens
		usage.PromptTokensDetails.CachedCreationTokens = usage.InputTokensDetails.CachedCreationTokens
		usage.PromptTokensDetails.CacheWriteTokens = usage.InputTokensDetails.CacheWriteTokens
		usage.PromptTokensDetails.ImageTokens = usage.InputTokensDetails.ImageTokens
		usage.PromptTokensDetails.TextTokens = usage.InputTokensDetails.TextTokens
		usage.PromptTokensDetails.AudioTokens = usage.InputTokensDetails.AudioTokens
	}
	if usage.TotalTokens == 0 {
		usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	}
}

func OpenaiImageStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		logger.LogError(c, "invalid image stream response")
		return nil, types.NewOpenAIError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return OpenaiImageHandler(c, info, resp)
	}
	if !strings.Contains(contentType, "text/event-stream") {
		return openaiImageJSONAsStreamHandler(c, info, resp)
	}
	if imageRequestStream, exists := c.Get("image_request_stream"); exists && !c.GetBool("chat_image_compat_stream") {
		stream, _ := imageRequestStream.(bool)
		if !stream {
			return OpenaiImageStreamToJSONHandler(c, info, resp)
		}
	}
	// Reuse the shared streaming engine (helper.StreamScannerHandler) so the
	// image streaming path gets the same ping keepalive, streaming-timeout
	// watchdog, client-disconnect detection, panic recovery and goroutine
	// cleanup as every other relay stream. The scanner delivers only the
	// "data:" payload, so the SSE "event:" line is rebuilt from the JSON "type"
	// field (real OpenAI image events keep event == type).
	usage := &dto.Usage{}
	var lastStreamData []byte
	var completedImages int64

	helper.StreamScannerHandler(c, resp, info, func(data string, sr *helper.StreamResult) {
		raw := common.StringToByteSlice(data)
		lastStreamData = raw
		if isOpenAIImageStreamErrorEvent(raw) {
			// Record the error as a soft error; the scanner drives the final
			// EndReason. HasErrors() flags the failure for logging/handling.
			sr.Error(fmt.Errorf("%s", extractOpenAIImageStreamErrorMessage(raw)))
		}
		var chunk struct {
			Type  string    `json:"type"`
			Usage dto.Usage `json:"usage"`
		}
		if err := common.Unmarshal(raw, &chunk); err == nil {
			normalizeOpenAIUsage(&chunk.Usage)
			if service.ValidUsage(&chunk.Usage) {
				usage = &chunk.Usage
			}
			if chunk.Type == "image_generation.completed" || chunk.Type == "image_edit.completed" {
				completedImages++
			}
		}
		if err := writeOpenaiImageStreamChunk(c, raw); err != nil {
			sr.Stop(err)
		}
	})

	// StreamScannerHandler consumes the upstream [DONE]; re-emit it so the
	// client still receives a terminal data: [DONE].
	if info.StreamStatus != nil && info.StreamStatus.EndReason == relaycommon.StreamEndReasonDone {
		helper.Done(c)
	}

	applyUsagePostProcessing(info, usage, lastStreamData)
	// Only trust completedImages when upstream finished the stream (done/eof).
	// On client-side aborts (client_gone, or handler_stop from a failed client
	// write) the counter undercounts what upstream actually generated and
	// charged, so keep the requested n — otherwise a client could pay for one
	// image by disconnecting right after the first completed event. The abort
	// guard only blocks lowering the charge: if completed events already
	// exceed the recorded n, bill the higher actual count regardless.
	if info.StreamStatus != nil {
		upstreamFinished := info.StreamStatus.EndReason == relaycommon.StreamEndReasonDone ||
			info.StreamStatus.EndReason == relaycommon.StreamEndReasonEOF
		requestedN := 1.0
		if n, ok := info.PriceData.OtherRatios()["n"]; ok {
			requestedN = n
		}
		if upstreamFinished || float64(completedImages) > requestedN {
			updateOpenAIImageCount(info, completedImages)
		}
	}
	return usage, nil
}

func OpenaiImageStreamToJSONHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}
	defer service.CloseResponseBodyGracefully(resp)

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	statusCode := resp.StatusCode
	headerWritten := false

	flusher, _ := c.Writer.(http.Flusher)
	writeKeepAlive := func() error {
		if !headerWritten {
			c.Writer.WriteHeader(statusCode)
			headerWritten = true
		}
		if _, err := c.Writer.Write([]byte("\n")); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
		return nil
	}

	eventBuffer := ""
	imageResp := dto.ImageResponse{
		Created: time.Now().Unix(),
		Data:    make([]dto.ImageData, 0),
	}
	taskID := model.GenerateTaskID()
	usage := &dto.Usage{}
	hasUsage := false

	processEvent := func(rawEvent string) error {
		streamUsage, imageData, keepAlive, err := convertImageStreamEventToJSONData(c, rawEvent, taskID)
		if err != nil {
			return err
		}
		if keepAlive {
			return writeKeepAlive()
		}
		if streamUsage != nil {
			usage = streamUsage
			hasUsage = true
		}
		if imageData != nil {
			imageResp.Data = append(imageResp.Data, *imageData)
		}
		return nil
	}

	buffer := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buffer)
		if n > 0 {
			if info != nil {
				info.SetFirstResponseTime()
			}
			eventBuffer += strings.ReplaceAll(string(buffer[:n]), "\r\n", "\n")
			for {
				delimiterIndex := strings.Index(eventBuffer, "\n\n")
				if delimiterIndex == -1 {
					break
				}
				rawEvent := eventBuffer[:delimiterIndex]
				eventBuffer = eventBuffer[delimiterIndex+2:]
				if err := processEvent(rawEvent); err != nil {
					return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
				}
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				logger.LogError(c, readErr.Error())
			}
			break
		}
	}

	if strings.TrimSpace(eventBuffer) != "" {
		if err := processEvent(eventBuffer); err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}
	}

	if len(imageResp.Data) == 0 {
		return nil, types.NewOpenAIError(fmt.Errorf("image stream completed without image data"), types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	body, err := common.Marshal(imageResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if !headerWritten {
		c.Writer.WriteHeader(statusCode)
		headerWritten = true
	}
	if _, err := c.Writer.Write(body); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if flusher != nil {
		flusher.Flush()
	}
	// 这条路径是 Cherry Studio 等客户端"非流式请求被强制改成上游 stream"后的回写路径
	// （shouldForceUpstreamImageStream）。此时 info.IsStream 已被污染为 true，
	// image_handler.go 的 persistSyncImageResponse 不会触发，导致生图日志漏记。
	// 在这里补写日志，url 取自 convertImageStreamEventToJSONData 已落 R2 的公链。
	persistStreamToJSONImageLog(c, info, &imageResp)
	if hasUsage {
		return usage, nil
	}
	return &dto.Usage{PromptTokens: 1, TotalTokens: 1}, nil
}

// persistStreamToJSONImageLog 为 stream→JSON 聚合路径补写生图日志。
// imageResp.Data 里的每个 item 已带 R2 公链（见 convertImageStreamEventToJSONData），
// 直接取 Url 作为日志的 ImageUrls，不重复上传。
func persistStreamToJSONImageLog(c *gin.Context, info *relaycommon.RelayInfo, imageResp *dto.ImageResponse) {
	if c == nil || info == nil || imageResp == nil {
		return
	}
	// 仅对真正的生图/改图请求落库；chat 兼容路径自带落库并设置 skip 标记，避免双写。
	if c.GetBool("chat_image_compat_skip_image_persist") {
		return
	}
	action := "image_generation"
	if info.RelayMode == relayconstant.RelayModeImagesEdits {
		action = "image_edit"
	}
	var model_, prompt string
	if req, ok := info.Request.(*dto.ImageRequest); ok && req != nil {
		model_ = req.Model
		prompt = req.Prompt
	}
	if model_ == "" {
		model_ = info.OriginModelName
	}
	urls := imageURLsFromStoredResponse(imageResp)
	now := time.Now().Unix()
	logEntry := &model.ImageGenerationLog{
		CreatedAt:  now,
		UpdatedAt:  now,
		FinishedAt: now,
		UserId:     info.UserId,
		TokenId:    info.TokenId,
		TokenName:  c.GetString("token_name"),
		TaskID:     model.GenerateTaskID(),
		Action:     action,
		Model:      model_,
		Prompt:     prompt,
		Status:     model.TaskStatusSuccess,
	}
	logEntry.SetImageURLs(urls)
	go func() {
		if err := model.CreateImageGenerationLog(logEntry); err != nil {
			logger.LogError(context.Background(), fmt.Sprintf("create stream-to-json image generation log failed: %s", err.Error()))
		}
	}()
}

// imageURLsFromStoredResponse 收集已落 R2 的公链，用于写入生图日志的 ImageUrls。
// 只取非空 Url（b64_json 不入日志，避免数据库膨胀）。
func imageURLsFromStoredResponse(resp *dto.ImageResponse) []string {
	if resp == nil {
		return nil
	}
	urls := make([]string, 0, len(resp.Data))
	for _, item := range resp.Data {
		if u := strings.TrimSpace(item.Url); u != "" {
			urls = append(urls, u)
		}
	}
	return urls
}

func convertImageStreamEventToJSONData(c *gin.Context, rawEvent string, taskID string) (*dto.Usage, *dto.ImageData, bool, error) {
	rawEvent = strings.TrimSpace(rawEvent)
	if rawEvent == "" {
		return nil, nil, false, nil
	}
	if strings.HasPrefix(rawEvent, ":") {
		return nil, nil, true, nil
	}

	eventName, data := parseOpenAIImageSSEFrame(rawEvent)
	data = strings.TrimSpace(data)
	if data == "" || data == "[DONE]" {
		return nil, nil, false, nil
	}
	var payload map[string]interface{}
	if err := common.Unmarshal([]byte(data), &payload); err != nil {
		return nil, nil, false, err
	}
	payloadType, _ := payload["type"].(string)
	if strings.Contains(strings.ToLower(eventName), "partial_image") ||
		strings.Contains(strings.ToLower(payloadType), "partial_image") {
		return nil, nil, false, nil
	}
	if !strings.HasSuffix(strings.ToLower(eventName), ".completed") &&
		!strings.HasSuffix(strings.ToLower(payloadType), ".completed") {
		eventLower := strings.ToLower(eventName)
		typeLower := strings.ToLower(payloadType)
		if strings.Contains(eventLower, "keep-alive") ||
			strings.Contains(typeLower, "keep-alive") ||
			strings.Contains(eventLower, "heartbeat") ||
			strings.Contains(typeLower, "heartbeat") ||
			strings.Contains(eventLower, "ping") ||
			strings.Contains(typeLower, "ping") {
			return nil, nil, true, nil
		}
		return nil, nil, false, nil
	}

	var usage *dto.Usage
	if rawUsage, ok := payload["usage"]; ok {
		usageBytes, err := common.Marshal(rawUsage)
		if err == nil {
			var parsedUsage dto.Usage
			if common.Unmarshal(usageBytes, &parsedUsage) == nil {
				normalizeOpenAIUsage(&parsedUsage)
				usage = &parsedUsage
			}
		}
	}

	if url, _ := payload["url"].(string); strings.TrimSpace(url) != "" {
		return usage, &dto.ImageData{Url: strings.TrimSpace(url)}, false, nil
	}
	b64, _ := payload["b64_json"].(string)
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return usage, nil, false, fmt.Errorf("image_generation.completed payload contains no b64_json or url")
	}
	// 保留 b64_json：Cherry Studio 的 OpenAICompatibleImageModel 请求 response_format=b64_json，
	// 只读取 data[].b64_json。若这里只回 url，客户端读不到图，表现为请求成功但图丢失。
	// 落存储仅为给 image log 附一个公网 url，是 best-effort —— 存储失败也不能丢掉这张图。
	imageData := &dto.ImageData{B64Json: b64}
	if storedResp, err := service.PersistImageResponseToStorage(c.Request.Context(), taskID, &dto.ImageResponse{
		Data: []dto.ImageData{{B64Json: b64}},
	}); err == nil && storedResp != nil && len(storedResp.Data) > 0 {
		if u := strings.TrimSpace(storedResp.Data[0].Url); u != "" {
			imageData.Url = u
		}
	}
	return usage, imageData, false, nil
}

func parseOpenAIImageSSEFrame(frame string) (eventName string, data string) {
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

// writeOpenaiImageStreamChunk rebuilds the SSE frame for an image stream chunk:
// it emits an "event:" line derived from the JSON "type" field (when present)
// followed by the verbatim "data:" payload, mirroring helper.ResponseChunkData.
func writeOpenaiImageStreamChunk(c *gin.Context, data []byte) error {
	var payload struct {
		Type string `json:"type"`
	}
	_ = common.Unmarshal(data, &payload)
	if eventName := strings.TrimSpace(payload.Type); eventName != "" {
		return helper.ResponseChunkData(c, dto.ResponsesStreamResponse{Type: eventName}, string(data))
	}
	return helper.StringData(c, string(data))
}

// isOpenAIImageStreamErrorEvent detects upstream error chunks by JSON content
// only ("type" of error/upstream_error, or a non-empty "error" field). The SSE
// "event:" line is not available here: StreamScannerHandler delivers only the
// "data:" payload. A payload carrying just a "message" key is deliberately NOT
// treated as an error to avoid false positives.
func isOpenAIImageStreamErrorEvent(data []byte) bool {
	if !json.Valid(data) {
		return false
	}
	var payload struct {
		Type  string          `json:"type"`
		Error json.RawMessage `json:"error"`
	}
	if err := common.Unmarshal(data, &payload); err != nil {
		return false
	}
	payloadType := strings.ToLower(strings.TrimSpace(payload.Type))
	return payloadType == "error" || payloadType == "upstream_error" || len(payload.Error) > 0
}

func extractOpenAIImageStreamErrorMessage(data []byte) string {
	if len(data) == 0 || !json.Valid(data) {
		return "upstream image stream returned error event"
	}
	var payload struct {
		Message string          `json:"message"`
		Error   json.RawMessage `json:"error"`
	}
	if err := common.Unmarshal(data, &payload); err != nil {
		return "upstream image stream returned error event"
	}
	if msg := strings.TrimSpace(payload.Message); msg != "" {
		return msg
	}
	if len(payload.Error) > 0 {
		var nested struct {
			Message string `json:"message"`
		}
		if err := common.Unmarshal(payload.Error, &nested); err == nil {
			if msg := strings.TrimSpace(nested.Message); msg != "" {
				return msg
			}
		}
		if msg := strings.TrimSpace(common.JsonRawMessageToString(payload.Error)); msg != "" {
			return msg
		}
	}
	return "upstream image stream returned error event"
}

func openaiImageJSONAsStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}

	// Only decode usage/error. Do not Unmarshal data[] into dto.ImageResponse —
	// b64_json values are large and would be copied into Go strings then
	// re-marshaled for each SSE event.
	var usageResp dto.SimpleResponse
	if err := common.Unmarshal(responseBody, &usageResp); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if oaiError := usageResp.GetOpenAIError(); oaiError != nil && oaiError.Type != "" {
		return nil, types.WithOpenAIError(*oaiError, resp.StatusCode)
	}
	normalizeOpenAIUsage(&usageResp.Usage)
	applyUsagePostProcessing(info, &usageResp.Usage, responseBody)

	imageCount := gjson.GetBytes(responseBody, "data.#").Int()
	updateOpenAIImageCount(info, imageCount)

	helper.SetEventStreamHeaders(c)
	c.Status(http.StatusOK)

	created := gjson.GetBytes(responseBody, "created").Int()
	if created == 0 {
		created = time.Now().Unix()
	}
	if info != nil {
		info.SetFirstResponseTime()
	}

	validUsage := service.ValidUsage(&usageResp.Usage)
	var usageJSON []byte
	if validUsage {
		usageJSON, err = common.Marshal(usageResp.Usage)
		if err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}
	}

	for i := int64(0); i < imageCount; i++ {
		image := gjson.GetBytes(responseBody, "data."+strconv.FormatInt(i, 10))
		payload := []byte(`{"type":"image_generation.completed"}`)
		payload, err = sjson.SetBytes(payload, "created_at", created)
		if err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}
		if validUsage {
			payload, err = sjson.SetRawBytes(payload, "usage", usageJSON)
			if err != nil {
				return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
			}
		}
		// b64_json goes last: every sjson.Set* reallocates the whole payload,
		// so inserting the large blob after all small fields avoids re-copying
		// multi-MB buffers.
		for _, field := range []string{"url", "revised_prompt", "b64_json"} {
			value := image.Get(field)
			if value.Type != gjson.String || value.Raw == `""` {
				continue
			}
			raw := []byte(value.Raw)
			if value.Index > 0 {
				raw = responseBody[value.Index : value.Index+len(value.Raw)]
			}
			payload, err = sjson.SetRawBytes(payload, field, raw)
			if err != nil {
				return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
			}
		}
		if writeErr := helper.ResponseChunkData(c, dto.ResponsesStreamResponse{Type: "image_generation.completed"}, string(payload)); writeErr != nil {
			if info != nil && info.StreamStatus != nil {
				info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonClientGone, writeErr)
			}
			return &usageResp.Usage, nil
		}
	}
	if err := writeOpenaiImageStreamDone(c); err != nil {
		if info != nil && info.StreamStatus != nil {
			info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonClientGone, err)
		}
		return &usageResp.Usage, nil
	}
	if info != nil {
		info.ReceivedResponseCount += int(imageCount)
		if info.StreamStatus == nil {
			info.StreamStatus = relaycommon.NewStreamStatus()
		}
		info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonDone, nil)
	}
	return &usageResp.Usage, nil
}

func writeOpenaiImageStreamDone(c *gin.Context) error {
	return helper.StringData(c, "[DONE]")
}
