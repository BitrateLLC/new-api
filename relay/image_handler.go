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
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func ImageHelper(c *gin.Context, info *relaycommon.RelayInfo) (newAPIError *types.NewAPIError) {
	info.InitChannelMeta(c)

	imageReq, ok := info.Request.(*dto.ImageRequest)
	if !ok {
		return types.NewErrorWithStatusCode(fmt.Errorf("invalid request type, expected dto.ImageRequest, got %T", info.Request), types.ErrorCodeInvalidRequest, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}

	request, err := common.DeepCopy(imageReq)
	if err != nil {
		return types.NewError(fmt.Errorf("failed to copy request to ImageRequest: %w", err), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	c.Set("image_request_stream", request.IsStream(c))

	err = helper.ModelMappedHelper(c, info, request)
	if err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	}
	forceUpstreamStream := shouldForceUpstreamImageStream(info, request)
	if forceUpstreamStream {
		request.Stream = common.GetPointer(true)
	}

	adaptor := GetAdaptor(info.ApiType)
	if adaptor == nil {
		return types.NewError(fmt.Errorf("invalid api type: %d", info.ApiType), types.ErrorCodeInvalidApiType, types.ErrOptionWithSkipRetry())
	}
	adaptor.Init(info)

	var requestBody io.Reader

	if (model_setting.GetGlobalSettings().PassThroughRequestEnabled || info.ChannelSetting.PassThroughBodyEnabled) && !c.GetBool(chatImageCompatibilityContextKey) && !forceUpstreamStream {
		storage, err := common.GetBodyStorage(c)
		if err != nil {
			return types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
		}
		requestBody = common.ReaderOnly(storage)
	} else {
		convertedRequest, err := adaptor.ConvertImageRequest(c, info, *request)
		if err != nil {
			return types.NewError(err, types.ErrorCodeConvertRequestFailed)
		}
		relaycommon.AppendRequestConversionFromRequest(info, convertedRequest)

		switch convertedRequest.(type) {
		case *bytes.Buffer:
			requestBody = convertedRequest.(io.Reader)
		default:
			jsonData, err := common.Marshal(convertedRequest)
			if err != nil {
				return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
			}

			// apply param override
			if len(info.ParamOverride) > 0 {
				jsonData, err = relaycommon.ApplyParamOverrideWithRelayInfo(jsonData, info)
				if err != nil {
					return newAPIErrorFromParamOverride(err)
				}
			}

			logger.LogDebug(c, "image request body: %s", jsonData)
			body, size, closer, err := relaycommon.NewOutboundJSONBody(jsonData)
			if err != nil {
				return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
			}
			defer closer.Close()
			jsonData = nil
			info.UpstreamRequestBodySize = size
			requestBody = body
		}
	}

	statusCodeMappingStr := c.GetString("status_code_mapping")

	resp, err := adaptor.DoRequest(c, info, requestBody)
	if err != nil {
		return types.NewOpenAIError(err, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)
	}
	var httpResp *http.Response
	if resp != nil {
		httpResp = resp.(*http.Response)
		info.IsStream = info.IsStream || strings.HasPrefix(httpResp.Header.Get("Content-Type"), "text/event-stream")
		if httpResp.StatusCode != http.StatusOK {
			if httpResp.StatusCode == http.StatusCreated && info.ApiType == constant.APITypeReplicate {
				// replicate channel returns 201 Created when using Prefer: wait, treat it as success.
				httpResp.StatusCode = http.StatusOK
			} else {
				newAPIError = service.RelayErrorHandler(c.Request.Context(), httpResp, false)
				// reset status code 重置状态码
				service.ResetStatusCode(newAPIError, statusCodeMappingStr)
				return newAPIError
			}
		}
	}

	var captureWriter *imageResponseCaptureWriter
	if shouldPersistSyncImageResponse(c, info) {
		captureWriter = &imageResponseCaptureWriter{ResponseWriter: c.Writer}
		c.Writer = captureWriter
	}

	usage, newAPIError := adaptor.DoResponse(c, httpResp, info)
	if newAPIError != nil {
		// reset status code 重置状态码
		service.ResetStatusCode(newAPIError, statusCodeMappingStr)
		return newAPIError
	}
	if captureWriter != nil {
		persistSyncImageResponse(c, info, request, captureWriter.body.Bytes())
	}

	imageN := uint(1)
	if request.N != nil {
		imageN = *request.N
	}

	// n is handled via OtherRatio so it is applied exactly once in quota
	// calculation (both price-based and ratio-based paths).
	// Adaptors may have already set a more accurate count from the
	// upstream response; only set the default when they haven't.
	if info.PriceData.UsePrice { // only price model use N ratio
		if !info.PriceData.HasOtherRatio("n") {
			info.PriceData.AddOtherRatio("n", float64(imageN))
		}
	}

	imageUsage := usage.(*dto.Usage)
	normalizeImageUsageForLog(imageUsage)
	if imageUsage.TotalTokens == 0 {
		imageUsage.TotalTokens = 1
	}
	if imageUsage.PromptTokens == 0 {
		imageUsage.PromptTokens = 1
	}

	quality := request.Quality
	if quality == "" {
		quality = "standard"
	}

	var logContent []string

	if len(request.Size) > 0 {
		logContent = append(logContent, fmt.Sprintf("大小 %s", request.Size))
	}
	if len(quality) > 0 {
		logContent = append(logContent, fmt.Sprintf("品质 %s", quality))
	}
	if imageN > 0 {
		logContent = append(logContent, fmt.Sprintf("生成数量 %d", imageN))
	}

	service.PostTextConsumeQuota(c, info, imageUsage, logContent)
	return nil
}

type imageResponseCaptureWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func (w *imageResponseCaptureWriter) Write(data []byte) (int, error) {
	if len(data) > 0 {
		_, _ = w.body.Write(data)
	}
	return w.ResponseWriter.Write(data)
}

func (w *imageResponseCaptureWriter) WriteString(s string) (int, error) {
	if s != "" {
		_, _ = w.body.WriteString(s)
	}
	return w.ResponseWriter.WriteString(s)
}

func shouldPersistSyncImageResponse(c *gin.Context, info *relaycommon.RelayInfo) bool {
	return info != nil &&
		(c == nil || !c.GetBool(chatImageCompatibilitySkipImagePersistKey)) &&
		!info.IsStream &&
		(info.RelayMode == relayconstant.RelayModeImagesGenerations ||
			info.RelayMode == relayconstant.RelayModeImagesEdits)
}

func shouldForceUpstreamImageStream(info *relaycommon.RelayInfo, request *dto.ImageRequest) bool {
	return info != nil &&
		info.ChannelMeta != nil &&
		request != nil &&
		info.ApiType == constant.APITypeOpenAI &&
		(info.RelayMode == relayconstant.RelayModeImagesGenerations ||
			info.RelayMode == relayconstant.RelayModeImagesEdits) &&
		strings.EqualFold(request.Model, "gpt-image-2") &&
		!request.IsStream(nil) &&
		!request.Async
}

func persistSyncImageResponse(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ImageRequest, responseBody []byte) {
	if len(responseBody) == 0 || info == nil || request == nil {
		return
	}
	taskID := model.GenerateTaskID()
	now := time.Now().Unix()
	action := "image_generation"
	if info.RelayMode == relayconstant.RelayModeImagesEdits {
		action = "image_edit"
	}
	log := &model.ImageGenerationLog{
		CreatedAt:  now,
		UpdatedAt:  now,
		FinishedAt: now,
		UserId:     info.UserId,
		TokenId:    info.TokenId,
		TokenName:  c.GetString("token_name"),
		TaskID:     taskID,
		Action:     action,
		Model:      request.Model,
		Prompt:     request.Prompt,
		Status:     model.TaskStatusSuccess,
	}
	body := append([]byte(nil), responseBody...)
	go func() {
		var imageResp dto.ImageResponse
		if err := common.Unmarshal(body, &imageResp); err != nil {
			log.Status = model.TaskStatusFailure
			log.Error = fmt.Sprintf("parse image response: %s", err.Error())
			if createErr := model.CreateImageGenerationLog(log); createErr != nil {
				logger.LogError(context.Background(), fmt.Sprintf("create sync image generation log failed: %s", createErr.Error()))
			}
			return
		}
		storedResp, err := service.PersistImageResponseToStorage(context.Background(), taskID, &imageResp)
		if err != nil {
			log.Status = model.TaskStatusFailure
			log.Error = err.Error()
		} else {
			log.SetImageURLs(imageURLsFromImageResponse(storedResp))
		}
		if createErr := model.CreateImageGenerationLog(log); createErr != nil {
			logger.LogError(context.Background(), fmt.Sprintf("create sync image generation log failed: %s", createErr.Error()))
		}
	}()
}

func imageURLsFromImageResponse(resp *dto.ImageResponse) []string {
	if resp == nil {
		return nil
	}
	urls := make([]string, 0, len(resp.Data))
	for _, item := range resp.Data {
		if strings.TrimSpace(item.Url) != "" {
			urls = append(urls, item.Url)
		}
	}
	return urls
}

func normalizeImageUsageForLog(usage *dto.Usage) {
	if usage == nil {
		return
	}
	if usage.PromptTokens == 0 && usage.InputTokens > 0 {
		usage.PromptTokens = usage.InputTokens
	}
	if usage.CompletionTokens == 0 && usage.OutputTokens > 0 {
		usage.CompletionTokens = usage.OutputTokens
	}
	if usage.TotalTokens == 0 {
		usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	}
	if usage.InputTokens == 0 && usage.PromptTokens > 0 {
		usage.InputTokens = usage.PromptTokens
	}
	if usage.OutputTokens == 0 && usage.CompletionTokens > 0 {
		usage.OutputTokens = usage.CompletionTokens
	}
	if usage.InputTokensDetails != nil {
		if usage.PromptTokensDetails.CachedTokens == 0 {
			usage.PromptTokensDetails.CachedTokens = usage.InputTokensDetails.CachedTokens
		}
		if usage.PromptTokensDetails.TextTokens == 0 {
			usage.PromptTokensDetails.TextTokens = usage.InputTokensDetails.TextTokens
		}
		if usage.PromptTokensDetails.AudioTokens == 0 {
			usage.PromptTokensDetails.AudioTokens = usage.InputTokensDetails.AudioTokens
		}
		if usage.PromptTokensDetails.ImageTokens == 0 {
			usage.PromptTokensDetails.ImageTokens = usage.InputTokensDetails.ImageTokens
		}
	}
	if usage.OutputTokensDetails != nil {
		if usage.CompletionTokenDetails.TextTokens == 0 {
			usage.CompletionTokenDetails.TextTokens = usage.OutputTokensDetails.TextTokens
		}
		if usage.CompletionTokenDetails.AudioTokens == 0 {
			usage.CompletionTokenDetails.AudioTokens = usage.OutputTokensDetails.AudioTokens
		}
		if usage.CompletionTokenDetails.ImageTokens == 0 {
			usage.CompletionTokenDetails.ImageTokens = usage.OutputTokensDetails.ImageTokens
		}
		if usage.CompletionTokenDetails.ReasoningTokens == 0 {
			usage.CompletionTokenDetails.ReasoningTokens = usage.OutputTokensDetails.ReasoningTokens
		}
	}
}
