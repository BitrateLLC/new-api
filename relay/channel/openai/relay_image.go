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
	var streamErrMsg string

	helper.StreamScannerHandler(c, resp, info, func(data string, sr *helper.StreamResult) {
		raw := common.StringToByteSlice(data)
		lastStreamData = raw
		if isOpenAIImageStreamErrorEvent(raw) {
			// 记录为软错误以驱动 EndReason；同时捕获错误信息，流结束后作为硬错误
			// 返回，避免上游安全拦截(safety_violations）被记成 SUCCESS 且无 image url。
			msg := extractOpenAIImageStreamErrorMessage(raw)
			streamErrMsg = msg
			sr.Error(fmt.Errorf("%s", msg))
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
	if strings.TrimSpace(streamErrMsg) != "" {
		return usage, types.NewOpenAIError(fmt.Errorf("%s", streamErrMsg), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
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
	var lastPartial *dto.ImageData // 仅收到 partial_image、无可用 completed 帧时的兜底图
	var rawBody strings.Builder    // 累计完整响应体，用于"假流式(整块 JSON)"回退解析

	processEvent := func(rawEvent string) error {
		streamUsage, imageData, keepAlive, partial, err := convertImageStreamEventToJSONData(c, rawEvent, taskID)
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
			if partial {
				lastPartial = imageData
			} else {
				imageResp.Data = append(imageResp.Data, *imageData)
			}
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
			rawBody.Write(buffer[:n])
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
		// 没有可用的 completed 帧时，用最后一帧 partial_image 兜底（补落存储换取公链）。
		if lastPartial != nil {
			if strings.TrimSpace(lastPartial.Url) == "" && strings.TrimSpace(lastPartial.B64Json) != "" {
				if storedResp, err := service.PersistImageResponseToStorage(c.Request.Context(), taskID, &dto.ImageResponse{
					Data: []dto.ImageData{{B64Json: lastPartial.B64Json}},
				}); err == nil && storedResp != nil && len(storedResp.Data) > 0 {
					if su := strings.TrimSpace(storedResp.Data[0].Url); su != "" {
						lastPartial.Url = su
					}
				}
			}
			logger.LogWarn(c, "image stream had no completed frame; falling back to last partial image")
			imageResp.Data = append(imageResp.Data, *lastPartial)
		} else {
			// 上游（如 cpa 直连代理 gpt-image）即使请求 stream=true，也可能在若干 SSE
			// keep-alive 注释行(": keep-alive\n\n")之后，直接跟一整块裸 JSON 图片响应
			// （Content-Type 仍是 text/event-stream，且 JSON 没有 data: 前缀）。按 SSE 切帧
			// 取不到图片，这里去掉非 JSON 前缀后，把那块 JSON 当普通图片响应解析。
			full := strings.TrimSpace(rawBody.String())
			if start := strings.IndexByte(full, '{'); start >= 0 {
				if end := strings.LastIndexByte(full, '}'); end >= start {
					full = full[start : end+1]
				}
			}
			if isOpenAIImageStreamErrorEvent([]byte(full)) {
				return nil, types.NewOpenAIError(fmt.Errorf("%s", extractOpenAIImageStreamErrorMessage([]byte(full))), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
			}
			var plain dto.ImageResponse
			if err := common.Unmarshal([]byte(full), &plain); err == nil && len(plain.Data) > 0 {
				imageResp.Data = plain.Data
				if plain.Created != 0 {
					imageResp.Created = plain.Created
				}
				var usageWrap dto.SimpleResponse
				if common.Unmarshal([]byte(full), &usageWrap) == nil {
					normalizeOpenAIUsage(&usageWrap.Usage)
					if service.ValidUsage(&usageWrap.Usage) {
						usage = &usageWrap.Usage
						hasUsage = true
					}
				}
			} else {
				// 诊断:既非可识别 SSE、也无法当普通图片 JSON 解析时，打印上游响应体头部
				// （截断 600 字，base64 通常不在开头，足以看清结构),便于定位 edits 真实形态。
				snippet := full
				if len(snippet) > 600 {
					snippet = snippet[:600]
				}
				logger.LogError(c, fmt.Sprintf("image stream no data; upstream content-type=%q body_len=%d head=%q", resp.Header.Get("Content-Type"), len(full), snippet))
				return nil, types.NewOpenAIError(fmt.Errorf("image stream completed without image data"), types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
			}
		}
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
// 客户端已拿到响应后，这里仍要确保图片被上传到 R2 并把公网 URL 写入日志。
func persistStreamToJSONImageLog(c *gin.Context, info *relaycommon.RelayInfo, imageResp *dto.ImageResponse) {
	if c == nil || info == nil || imageResp == nil {
		return
	}
	// 仅对真正的生图/改图请求落库；chat 兼容路径自带落库并设置 skip 标记，避免双写。
	if c.GetBool("chat_image_compat_skip_image_persist") {
		return
	}
	// 异步图片任务内部重放：任务侧已写日志，这里跳过以免出现两条相同日志。
	if c.GetBool("image_async_task_skip_image_persist") {
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
	now := time.Now().Unix()
	taskID := model.GenerateTaskID()
	logEntry := &model.ImageGenerationLog{
		CreatedAt:  now,
		UpdatedAt:  now,
		FinishedAt: now,
		UserId:     info.UserId,
		TokenId:    info.TokenId,
		TokenName:  c.GetString("token_name"),
		TaskID:     taskID,
		Action:     action,
		Model:      model_,
		Prompt:     prompt,
		Status:     model.TaskStatusSuccess,
	}
	go func() {
		storedResp, err := service.PersistImageResponseToStorage(context.Background(), taskID, imageResp)
		if err != nil {
			logEntry.Error = fmt.Sprintf("image generated but storage failed: %s", err.Error())
		} else {
			urls := imageURLsFromStoredResponse(storedResp)
			if len(urls) == 0 {
				logEntry.Error = "image storage did not produce public URL"
			} else {
				logEntry.SetImageURLs(urls)
			}
		}
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
		if u := strings.TrimSpace(item.Url); strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
			urls = append(urls, u)
		}
	}
	return urls
}

func convertImageStreamEventToJSONData(c *gin.Context, rawEvent string, taskID string) (*dto.Usage, *dto.ImageData, bool, bool, error) {
	rawEvent = strings.TrimSpace(rawEvent)
	if rawEvent == "" {
		return nil, nil, false, false, nil
	}
	if strings.HasPrefix(rawEvent, ":") {
		return nil, nil, true, false, nil
	}

	eventName, data := parseOpenAIImageSSEFrame(rawEvent)
	data = strings.TrimSpace(data)
	if data == "" || data == "[DONE]" {
		return nil, nil, false, false, nil
	}
	var payload map[string]interface{}
	if err := common.Unmarshal([]byte(data), &payload); err != nil {
		return nil, nil, false, false, err
	}
	payloadType, _ := payload["type"].(string)

	// 上游错误事件：主动识别并抛出真实错误，避免被掩盖成 "image stream completed without image data"。
	if isOpenAIImageStreamErrorEvent([]byte(data)) {
		return nil, nil, false, false, fmt.Errorf("%s", extractOpenAIImageStreamErrorMessage([]byte(data)))
	}

	eventLower := strings.ToLower(eventName)
	typeLower := strings.ToLower(payloadType)
	isPartial := strings.Contains(eventLower, "partial_image") || strings.Contains(typeLower, "partial_image")
	isCompleted := strings.HasSuffix(eventLower, ".completed") || strings.HasSuffix(typeLower, ".completed")
	if !isPartial && !isCompleted {
		if strings.Contains(eventLower, "keep-alive") || strings.Contains(typeLower, "keep-alive") ||
			strings.Contains(eventLower, "heartbeat") || strings.Contains(typeLower, "heartbeat") ||
			strings.Contains(eventLower, "ping") || strings.Contains(typeLower, "ping") {
			return nil, nil, true, false, nil
		}
		return nil, nil, false, false, nil
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

	// 兼容多种事件形态提取图片：images API（顶层 b64_json/url）、
	// Responses API（partial_image_b64 / result）、以及嵌套 data[].b64_json/url。
	if u := firstImageURLFromPayload(payload); u != "" {
		return usage, &dto.ImageData{Url: u}, false, isPartial, nil
	}
	b64 := firstImageB64FromPayload(payload)
	if b64 == "" {
		if isPartial {
			return usage, nil, false, true, nil // 部分帧暂无数据，忽略
		}
		return usage, nil, false, false, fmt.Errorf("image completed payload contains no b64_json or url")
	}
	if strings.HasPrefix(b64, "data:") { // dataURL 直接当作 url
		return usage, &dto.ImageData{Url: b64}, false, isPartial, nil
	}
	// 保留 b64_json：部分客户端只读 data[].b64_json。落存储仅为给 image log 附公网 url，
	// 是 best-effort；部分帧不落库，避免每帧重复上传。
	imageData := &dto.ImageData{B64Json: b64}
	if !isPartial {
		if storedResp, err := service.PersistImageResponseToStorage(c.Request.Context(), taskID, &dto.ImageResponse{
			Data: []dto.ImageData{{B64Json: b64}},
		}); err == nil && storedResp != nil && len(storedResp.Data) > 0 {
			if su := strings.TrimSpace(storedResp.Data[0].Url); su != "" {
				imageData.Url = su
			}
		}
	}
	return usage, imageData, false, isPartial, nil
}

// firstImageURLFromPayload 从常见位置提取图片 url（顶层 url，或 data[].url）。
func firstImageURLFromPayload(payload map[string]interface{}) string {
	if s, ok := payload["url"].(string); ok {
		if s = strings.TrimSpace(s); s != "" {
			return s
		}
	}
	if arr, ok := payload["data"].([]interface{}); ok {
		for _, it := range arr {
			if m, ok := it.(map[string]interface{}); ok {
				if s, ok := m["url"].(string); ok {
					if s = strings.TrimSpace(s); s != "" {
						return s
					}
				}
			}
		}
	}
	return ""
}

// firstImageB64FromPayload 从常见位置提取图片 base64（顶层 b64_json/partial_image_b64/result/image，
// 或 data[].b64_json）。
func firstImageB64FromPayload(payload map[string]interface{}) string {
	for _, k := range []string{"b64_json", "partial_image_b64", "result", "image"} {
		if s, ok := payload[k].(string); ok {
			if s = strings.TrimSpace(s); s != "" {
				return s
			}
		}
	}
	if arr, ok := payload["data"].([]interface{}); ok {
		for _, it := range arr {
			if m, ok := it.(map[string]interface{}); ok {
				if s, ok := m["b64_json"].(string); ok {
					if s = strings.TrimSpace(s); s != "" {
						return s
					}
				}
			}
		}
	}
	return ""
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

// imageStreamSafetyMarkers 标记上游"安全/审核拦截"的特征子串。cpa 直连 codex
// Image API 时，安全拦截(safety_violations）有时不带标准 error 信封(例如只给
// detail / message / safety_violations)，靠这些标记兜底识别，避免被当成"无图"。
var imageStreamSafetyMarkers = []string{
	"safety system",
	"rejected by the safety",
	"safety_violation",
	"content policy",
	"content_policy",
	"moderation_blocked",
	"moderation blocked",
}

func imageStreamBodyHasSafetyMarker(s string) bool {
	s = strings.ToLower(s)
	for _, m := range imageStreamSafetyMarkers {
		if strings.Contains(s, m) {
			return true
		}
	}
	return false
}

// jsonRawNonEmpty 判断一个原始 JSON 字段是否承载实际内容(排除空/ null /空容器/空串)。
func jsonRawNonEmpty(raw json.RawMessage) bool {
	switch strings.TrimSpace(string(raw)) {
	case "", "null", "[]", "{}", `""`:
		return false
	default:
		return true
	}
}

// isOpenAIImageStreamErrorEvent detects upstream error chunks by JSON content
// only ("type" of error/upstream_error, or a non-empty "error" field). The SSE
// "event:" line is not available here: StreamScannerHandler delivers only the
// "data:" payload. A payload carrying just a "message" key is deliberately NOT
// treated as an error to avoid false positives — unless that message/detail
// carries a safety/moderation marker, or the payload has non-empty
// safety_violations (which is unambiguously an upstream rejection).
func isOpenAIImageStreamErrorEvent(data []byte) bool {
	if !json.Valid(data) {
		return false
	}
	var payload struct {
		Type             string          `json:"type"`
		Error            json.RawMessage `json:"error"`
		Detail           json.RawMessage `json:"detail"`
		SafetyViolations json.RawMessage `json:"safety_violations"`
		Message          string          `json:"message"`
	}
	if err := common.Unmarshal(data, &payload); err != nil {
		return false
	}
	payloadType := strings.ToLower(strings.TrimSpace(payload.Type))
	if payloadType == "error" || payloadType == "upstream_error" || jsonRawNonEmpty(payload.Error) {
		return true
	}
	// safety_violations 非空 = 明确的上游安全拦截。
	if jsonRawNonEmpty(payload.SafetyViolations) {
		return true
	}
	// detail / message 仅在带 safety/审核标记时判定为错误，避免误伤正常帧。
	if jsonRawNonEmpty(payload.Detail) && imageStreamBodyHasSafetyMarker(string(payload.Detail)) {
		return true
	}
	if payload.Message != "" && imageStreamBodyHasSafetyMarker(payload.Message) {
		return true
	}
	return false
}

func extractOpenAIImageStreamErrorMessage(data []byte) string {
	const fallback = "upstream image stream returned error event"
	if len(data) == 0 || !json.Valid(data) {
		return fallback
	}
	var payload struct {
		Message          string          `json:"message"`
		Detail           json.RawMessage `json:"detail"`
		Error            json.RawMessage `json:"error"`
		SafetyViolations json.RawMessage `json:"safety_violations"`
	}
	if err := common.Unmarshal(data, &payload); err != nil {
		return fallback
	}

	msg := ""
	switch {
	case jsonRawNonEmpty(payload.Error):
		var nested struct {
			Message string `json:"message"`
		}
		if err := common.Unmarshal(payload.Error, &nested); err == nil {
			msg = strings.TrimSpace(nested.Message)
		}
		if msg == "" {
			if s := strings.TrimSpace(common.JsonRawMessageToString(payload.Error)); s != "" && s != "null" {
				msg = s
			}
		}
	case strings.TrimSpace(payload.Message) != "":
		msg = strings.TrimSpace(payload.Message)
	case jsonRawNonEmpty(payload.Detail):
		// detail 可能是字符串或对象：先按字符串解，失败则用原始 JSON。
		var detailStr string
		if common.Unmarshal(payload.Detail, &detailStr) == nil && strings.TrimSpace(detailStr) != "" {
			msg = strings.TrimSpace(detailStr)
		} else {
			msg = strings.TrimSpace(string(payload.Detail))
		}
	}

	// 附带 safety_violations(若有），便于客户端/日志看清拦截原因。
	if jsonRawNonEmpty(payload.SafetyViolations) {
		if msg == "" {
			msg = "request was rejected by the upstream safety system"
		}
		msg = msg + " safety_violations=" + strings.TrimSpace(string(payload.SafetyViolations))
	}

	if msg == "" {
		return fallback
	}
	return msg
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
