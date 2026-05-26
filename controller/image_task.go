package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

const imageTaskActionGeneration = "image_generation"
const imageTaskActionEdit = "image_edit"

func MaybeRelayImageTask(c *gin.Context, relayFormat types.RelayFormat) bool {
	if relayFormat != types.RelayFormatOpenAIImage {
		return false
	}
	relayMode := relayconstant.Path2RelayMode(c.Request.URL.Path)
	if relayMode != relayconstant.RelayModeImagesGenerations && relayMode != relayconstant.RelayModeImagesEdits {
		return false
	}
	imageReq, async, err := parseMaybeAsyncImageRequest(c, relayMode)
	if err != nil {
		respondOpenAIError(c, http.StatusBadRequest, err.Error())
		return true
	}
	if !async {
		return false
	}
	normalizeAsyncImageRequest(imageReq)
	bodyBytes, headers, err := imageTaskPayload(c, imageReq, relayMode)
	if err != nil {
		respondOpenAIError(c, http.StatusBadRequest, err.Error())
		return true
	}
	RelayImageTaskSubmit(c, imageReq, bodyBytes, headers)
	return true
}

func parseMaybeAsyncImageRequest(c *gin.Context, relayMode int) (*dto.ImageRequest, bool, error) {
	if relayMode == relayconstant.RelayModeImagesEdits && strings.Contains(c.Request.Header.Get("Content-Type"), "multipart/form-data") {
		form, err := common.ParseMultipartFormReusable(c)
		if err != nil {
			return nil, false, nil
		}
		if !multipartBoolValue(form, "async") {
			_ = form.RemoveAll()
			return nil, false, nil
		}
		c.Request.MultipartForm = form
		imageReq := imageRequestFromMultipartForm(form)
		return imageReq, true, nil
	}

	imageReq := &dto.ImageRequest{}
	if err := common.UnmarshalBodyReusable(c, imageReq); err != nil {
		return nil, false, nil
	}
	return imageReq, imageReq.Async, nil
}

func imageRequestFromMultipartForm(form *multipart.Form) *dto.ImageRequest {
	imageReq := &dto.ImageRequest{
		Prompt:         multipartFormValue(form, "prompt"),
		Model:          multipartFormValue(form, "model"),
		Quality:        multipartFormValue(form, "quality"),
		Size:           multipartFormValue(form, "size"),
		ResponseFormat: multipartFormValue(form, "response_format"),
		Stream:         multipartBoolValue(form, "stream"),
		Async:          multipartBoolValue(form, "async"),
	}
	imageReq.N = common.GetPointer(uint(common.String2Int(multipartFormValue(form, "n"))))
	if background := multipartFormValue(form, "background"); background != "" {
		imageReq.Background, _ = common.Marshal(background)
	}
	if moderation := multipartFormValue(form, "moderation"); moderation != "" {
		imageReq.Moderation, _ = common.Marshal(moderation)
	}
	if outputFormat := multipartFormValue(form, "output_format"); outputFormat != "" {
		imageReq.OutputFormat, _ = common.Marshal(outputFormat)
	}
	if outputCompression := multipartFormValue(form, "output_compression"); outputCompression != "" {
		imageReq.OutputCompression, _ = common.Marshal(common.String2Int(outputCompression))
	}
	if partialImages := multipartFormValue(form, "partial_images"); partialImages != "" {
		imageReq.PartialImages, _ = common.Marshal(common.String2Int(partialImages))
	}
	if imageValue := multipartFormValue(form, "image"); imageValue != "" {
		imageReq.Image, _ = common.Marshal(imageValue)
	}
	if imageReq.Model == "gpt-image-1" && imageReq.Quality == "" {
		imageReq.Quality = "standard"
	}
	if imageReq.N == nil || *imageReq.N == 0 {
		imageReq.N = common.GetPointer(uint(1))
	}
	if multipartFormHas(form, "watermark") {
		watermark := multipartBoolValue(form, "watermark")
		imageReq.Watermark = &watermark
	}
	return imageReq
}

func multipartFormValue(form *multipart.Form, key string) string {
	if form == nil || form.Value == nil {
		return ""
	}
	values := form.Value[key]
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func multipartBoolValue(form *multipart.Form, key string) bool {
	value := multipartFormValue(form, key)
	return strings.EqualFold(value, "true") || value == "1"
}

func multipartFormHas(form *multipart.Form, key string) bool {
	if form == nil || form.Value == nil {
		return false
	}
	_, ok := form.Value[key]
	return ok
}

func RelayImageTaskSubmit(c *gin.Context, request *dto.ImageRequest, bodyBytes []byte, headers http.Header) {
	if request == nil {
		respondOpenAIError(c, http.StatusBadRequest, "invalid image request")
		return
	}
	if request.Model == "" || strings.TrimSpace(request.Prompt) == "" {
		respondOpenAIError(c, http.StatusBadRequest, "model and prompt are required")
		return
	}

	relayInfo, err := prepareImageTaskRelayInfo(c, request)
	if err != nil {
		respondOpenAIError(c, http.StatusBadRequest, err.Error())
		return
	}

	relayMode := relayconstant.Path2RelayMode(c.Request.URL.Path)
	task := model.InitTask(constant.TaskPlatformImage, relayInfo)
	now := time.Now().Unix()
	task.Action = imageTaskActionGeneration
	if relayMode == relayconstant.RelayModeImagesEdits {
		task.Action = imageTaskActionEdit
	}
	task.Status = model.TaskStatusQueued
	task.Progress = "0%"
	task.CreatedAt = now
	task.UpdatedAt = now
	task.SubmitTime = now
	task.ChannelId = relayInfo.ChannelId
	task.PrivateData.BillingSource = relayInfo.BillingSource
	task.PrivateData.SubscriptionId = relayInfo.SubscriptionId
	task.PrivateData.TokenId = relayInfo.TokenId
	task.PrivateData.BillingContext = &model.TaskBillingContext{
		ModelPrice:      relayInfo.PriceData.ModelPrice,
		GroupRatio:      relayInfo.PriceData.GroupRatioInfo.GroupRatio,
		ModelRatio:      relayInfo.PriceData.ModelRatio,
		OtherRatios:     relayInfo.PriceData.OtherRatios,
		OriginModelName: relayInfo.OriginModelName,
		PerCallBilling:  relayInfo.PriceData.UsePrice,
	}
	task.SetData(map[string]any{
		"model":  request.Model,
		"prompt": request.Prompt,
		"action": task.Action,
	})
	if err := task.Insert(); err != nil {
		if relayInfo.Billing != nil {
			relayInfo.Billing.Refund(c)
		}
		respondOpenAIError(c, http.StatusInternalServerError, "create image task failed")
		return
	}

	snapshot := newImageTaskSnapshot(c, relayInfo, request, bodyBytes, headers, task.TaskID)
	go runImageTask(snapshot)

	c.JSON(http.StatusAccepted, dto.ImageTaskResponse{
		TaskID:    task.TaskID,
		Status:    string(model.TaskStatusQueued),
		Progress:  task.Progress,
		CreatedAt: task.CreatedAt,
		UpdatedAt: task.UpdatedAt,
	})
}

func prepareImageTaskRelayInfo(c *gin.Context, request *dto.ImageRequest) (*relaycommon.RelayInfo, error) {
	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAIImage, request, nil)
	if err != nil {
		return nil, err
	}
	relayInfo.ForcePreConsume = true
	relayInfo.InitChannelMeta(c)

	meta := request.GetTokenCountMeta()
	if setting.ShouldCheckPromptSensitive() && meta != nil {
		if contains, words := service.CheckSensitiveText(meta.CombineText); contains {
			logger.LogWarn(c, fmt.Sprintf("user sensitive words detected: %s", strings.Join(words, ", ")))
			return nil, errors.New("sensitive words detected")
		}
	}
	tokens, err := service.EstimateRequestToken(c, meta, relayInfo)
	if err != nil {
		return nil, err
	}
	relayInfo.SetEstimatePromptTokens(tokens)
	if _, err := helper.ModelPriceHelper(c, relayInfo, tokens, meta); err != nil {
		return nil, err
	}
	if !relayInfo.PriceData.FreeModel {
		if apiErr := service.PreConsumeBilling(c, relayInfo.PriceData.QuotaToPreConsume, relayInfo); apiErr != nil {
			return nil, apiErr.Err
		}
	}
	return relayInfo, nil
}

type imageTaskSnapshot struct {
	RelayInfo *relaycommon.RelayInfo
	Request   *dto.ImageRequest
	Body      []byte
	Headers   http.Header
	Path      string
	TaskID    string
	UserName  string
	TokenName string
	ClientIP  string
}

func newImageTaskSnapshot(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ImageRequest, body []byte, headers http.Header, taskID string) imageTaskSnapshot {
	if headers == nil {
		headers = c.Request.Header.Clone()
	}
	return imageTaskSnapshot{
		RelayInfo: info,
		Request:   request,
		Body:      append([]byte(nil), body...),
		Headers:   headers,
		Path:      c.Request.URL.String(),
		TaskID:    taskID,
		UserName:  c.GetString(string(constant.ContextKeyUserName)),
		TokenName: c.GetString("token_name"),
		ClientIP:  c.ClientIP(),
	}
}

func runImageTask(snapshot imageTaskSnapshot) {
	ctx := context.Background()
	task, ok, err := model.GetByOnlyTaskId(snapshot.TaskID)
	if err != nil || !ok {
		logger.LogError(ctx, fmt.Sprintf("image task %s not found: %v", snapshot.TaskID, err))
		return
	}
	updateImageTaskStatus(task, model.TaskStatusInProgress, "10%", "")

	recorder := httptest.NewRecorder()
	ginCtx, err := buildImageTaskGinContext(snapshot, recorder)
	if err != nil {
		refundImageTask(snapshot, ginCtx)
		failImageTask(task, err)
		return
	}

	if apiErr := relay.ImageHelper(ginCtx, snapshot.RelayInfo); apiErr != nil {
		refundImageTask(snapshot, ginCtx)
		failImageTask(task, apiErr.Err)
		return
	}
	if recorder.Code < http.StatusOK || recorder.Code >= http.StatusMultipleChoices {
		refundImageTask(snapshot, ginCtx)
		failImageTask(task, fmt.Errorf("image relay failed: HTTP %d %s", recorder.Code, recorder.Body.String()))
		return
	}

	var imageResp dto.ImageResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &imageResp); err != nil {
		refundImageTask(snapshot, ginCtx)
		failImageTask(task, fmt.Errorf("parse image response: %w", err))
		return
	}
	storedResp, err := service.PersistImageResponseToStorage(ctx, snapshot.TaskID, &imageResp)
	if err != nil {
		refundImageTask(snapshot, ginCtx)
		failImageTask(task, err)
		return
	}

	now := time.Now().Unix()
	task.Status = model.TaskStatusSuccess
	task.Progress = "100%"
	task.FinishTime = now
	task.UpdatedAt = now
	task.FailReason = ""
	task.PrivateData.ResultURL = firstImageURL(storedResp)
	task.Quota = snapshot.RelayInfo.FinalPreConsumedQuota
	task.SetData(storedResp)
	if err := task.Update(); err != nil {
		logger.LogError(ctx, fmt.Sprintf("update image task success failed: %s", err.Error()))
	}
}

func buildImageTaskGinContext(snapshot imageTaskSnapshot, recorder *httptest.ResponseRecorder) (*gin.Context, error) {
	ginCtx, _ := gin.CreateTestContext(recorder)
	path := snapshot.Path
	if path == "" {
		path = "/v1/images/generations"
	}
	req, err := http.NewRequest(http.MethodPost, path, bytes.NewReader(snapshot.Body))
	if err != nil {
		return nil, err
	}
	req.Header = snapshot.Headers.Clone()
	req.ContentLength = int64(len(snapshot.Body))
	ginCtx.Request = req
	ginCtx.Keys = map[string]any{}
	copyImageTaskContext(ginCtx, snapshot.RelayInfo)
	if snapshot.UserName != "" {
		common.SetContextKey(ginCtx, constant.ContextKeyUserName, snapshot.UserName)
	}
	if snapshot.TokenName != "" {
		ginCtx.Set("token_name", snapshot.TokenName)
	}
	if snapshot.ClientIP != "" {
		ginCtx.Set("client_ip", snapshot.ClientIP)
	}
	storage, err := common.CreateBodyStorage(snapshot.Body)
	if err != nil {
		return nil, err
	}
	ginCtx.Set(common.KeyBodyStorage, storage)
	return ginCtx, nil
}

func normalizeAsyncImageRequest(request *dto.ImageRequest) {
	if request == nil {
		return
	}
	if request.ResponseFormat == "" {
		request.ResponseFormat = "b64_json"
	}
	request.Stream = false
	request.Async = false
	request.PartialImages = nil
}

func imageTaskPayload(c *gin.Context, request *dto.ImageRequest, relayMode int) ([]byte, http.Header, error) {
	headers := c.Request.Header.Clone()
	if relayMode == relayconstant.RelayModeImagesEdits && strings.Contains(c.Request.Header.Get("Content-Type"), "multipart/form-data") {
		bodyBytes, contentType, err := buildImageEditTaskMultipartBody(c, request)
		if err != nil {
			return nil, nil, err
		}
		headers.Set("Content-Type", contentType)
		headers.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
		return bodyBytes, headers, nil
	}
	bodyBytes, err := common.Marshal(request)
	if err != nil {
		return nil, nil, err
	}
	headers.Set("Content-Type", "application/json")
	headers.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
	return bodyBytes, headers, nil
}

func buildImageEditTaskMultipartBody(c *gin.Context, request *dto.ImageRequest) ([]byte, string, error) {
	form := c.Request.MultipartForm
	if form == nil {
		if _, err := c.MultipartForm(); err != nil {
			return nil, "", fmt.Errorf("failed to parse image edit form request: %w", err)
		}
		form = c.Request.MultipartForm
	}
	if form == nil {
		return nil, "", errors.New("image edit form is empty")
	}
	defer form.RemoveAll()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	writeImageTaskFormFields(writer, form, request)
	if err := copyImageTaskFormFiles(writer, form); err != nil {
		_ = writer.Close()
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return body.Bytes(), writer.FormDataContentType(), nil
}

func writeImageTaskFormFields(writer *multipart.Writer, form *multipart.Form, request *dto.ImageRequest) {
	written := make(map[string]bool)
	for key, values := range form.Value {
		if key == "async" || key == "stream" || key == "partial_images" {
			continue
		}
		for _, value := range values {
			_ = writer.WriteField(key, value)
			written[key] = true
		}
	}
	if !written["model"] {
		_ = writer.WriteField("model", request.Model)
	}
	if !written["prompt"] {
		_ = writer.WriteField("prompt", request.Prompt)
	}
	if request.ResponseFormat != "" && !written["response_format"] {
		_ = writer.WriteField("response_format", request.ResponseFormat)
	}
	_ = writer.WriteField("stream", "false")
}

func copyImageTaskFormFiles(writer *multipart.Writer, form *multipart.Form) error {
	for fieldName, files := range form.File {
		for _, fileHeader := range files {
			if err := copyImageTaskFormFile(writer, fieldName, fileHeader); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyImageTaskFormFile(writer *multipart.Writer, fieldName string, fileHeader *multipart.FileHeader) error {
	file, err := fileHeader.Open()
	if err != nil {
		return fmt.Errorf("open form file %s: %w", fileHeader.Filename, err)
	}
	defer file.Close()

	partHeader := make(textproto.MIMEHeader)
	partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, fieldName, fileHeader.Filename))
	if contentType := fileHeader.Header.Get("Content-Type"); contentType != "" {
		partHeader.Set("Content-Type", contentType)
	}
	part, err := writer.CreatePart(partHeader)
	if err != nil {
		return fmt.Errorf("create form file %s: %w", fileHeader.Filename, err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return fmt.Errorf("copy form file %s: %w", fileHeader.Filename, err)
	}
	return nil
}

func copyImageTaskContext(c *gin.Context, info *relaycommon.RelayInfo) {
	if info == nil {
		return
	}
	common.SetContextKey(c, constant.ContextKeyUserId, info.UserId)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, info.UsingGroup)
	common.SetContextKey(c, constant.ContextKeyUserGroup, info.UserGroup)
	common.SetContextKey(c, constant.ContextKeyUserQuota, info.UserQuota)
	common.SetContextKey(c, constant.ContextKeyUserEmail, info.UserEmail)
	common.SetContextKey(c, constant.ContextKeyTokenId, info.TokenId)
	common.SetContextKey(c, constant.ContextKeyTokenKey, info.TokenKey)
	common.SetContextKey(c, constant.ContextKeyTokenUnlimited, info.TokenUnlimited)
	common.SetContextKey(c, constant.ContextKeyTokenGroup, info.TokenGroup)
	common.SetContextKey(c, constant.ContextKeyRequestStartTime, info.StartTime)
	common.SetContextKey(c, constant.ContextKeyEstimatedTokens, info.GetEstimatePromptTokens())
	c.Set(common.RequestIdKey, info.RequestId)
	if info.ChannelMeta == nil {
		return
	}
	common.SetContextKey(c, constant.ContextKeyChannelId, info.ChannelId)
	common.SetContextKey(c, constant.ContextKeyChannelType, info.ChannelType)
	common.SetContextKey(c, constant.ContextKeyChannelIsMultiKey, info.ChannelIsMultiKey)
	common.SetContextKey(c, constant.ContextKeyChannelMultiKeyIndex, info.ChannelMultiKeyIndex)
	common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, info.ChannelBaseUrl)
	common.SetContextKey(c, constant.ContextKeyChannelKey, info.ApiKey)
	common.SetContextKey(c, constant.ContextKeyChannelParamOverride, info.ParamOverride)
	common.SetContextKey(c, constant.ContextKeyChannelHeaderOverride, info.HeadersOverride)
	common.SetContextKey(c, constant.ContextKeyChannelSetting, info.ChannelSetting)
	common.SetContextKey(c, constant.ContextKeyChannelOtherSetting, info.ChannelOtherSettings)
	common.SetContextKey(c, constant.ContextKeyOriginalModel, info.OriginModelName)
	c.Set("api_version", info.ApiVersion)
	c.Set("channel_organization", info.Organization)
	c.Set("status_code_mapping", "")
}

func refundImageTask(snapshot imageTaskSnapshot, c *gin.Context) {
	if snapshot.RelayInfo != nil && snapshot.RelayInfo.Billing != nil {
		snapshot.RelayInfo.Billing.Refund(c)
	}
}

func updateImageTaskStatus(task *model.Task, status model.TaskStatus, progress string, reason string) {
	now := time.Now().Unix()
	task.Status = status
	task.Progress = progress
	task.FailReason = reason
	task.UpdatedAt = now
	if task.StartTime == 0 && status == model.TaskStatusInProgress {
		task.StartTime = now
	}
	if err := task.Update(); err != nil {
		logger.LogError(context.Background(), fmt.Sprintf("update image task status failed: %s", err.Error()))
	}
}

func failImageTask(task *model.Task, err error) {
	now := time.Now().Unix()
	task.Status = model.TaskStatusFailure
	task.Progress = "100%"
	task.FailReason = err.Error()
	task.FinishTime = now
	task.UpdatedAt = now
	if updateErr := task.Update(); updateErr != nil {
		logger.LogError(context.Background(), fmt.Sprintf("update image task failure failed: %s", updateErr.Error()))
	}
}

func firstImageURL(resp *dto.ImageResponse) string {
	if resp == nil {
		return ""
	}
	for _, item := range resp.Data {
		if item.Url != "" {
			return item.Url
		}
	}
	return ""
}

func GetImageTask(c *gin.Context) {
	taskID := c.Param("task_id")
	userID := c.GetInt("id")
	task, exist, err := model.GetByTaskId(userID, taskID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !exist || task.Platform != constant.TaskPlatformImage {
		common.ApiErrorMsg(c, "task not found")
		return
	}
	common.ApiSuccess(c, imageTaskResponseFromTask(task))
}

func GetImageTaskByToken(c *gin.Context) {
	taskID := c.Param("task_id")
	userID := c.GetInt("id")
	tokenID := c.GetInt("token_id")
	task, exist, err := model.GetByTaskIdAndTokenId(userID, tokenID, taskID)
	if err != nil {
		respondOpenAIError(c, http.StatusInternalServerError, err.Error())
		return
	}
	if !exist || task.Platform != constant.TaskPlatformImage {
		respondOpenAIError(c, http.StatusNotFound, "task not found")
		return
	}
	c.JSON(http.StatusOK, imageTaskResponseFromTask(task))
}

func imageTaskResponseFromTask(task *model.Task) dto.ImageTaskResponse {
	resp := dto.ImageTaskResponse{
		TaskID:     task.TaskID,
		Status:     string(task.Status),
		Progress:   task.Progress,
		CreatedAt:  task.CreatedAt,
		UpdatedAt:  task.UpdatedAt,
		FinishedAt: task.FinishTime,
	}
	if task.Status == model.TaskStatusFailure {
		resp.Error = task.FailReason
		return resp
	}
	var imageResp dto.ImageResponse
	if len(task.Data) > 0 && common.Unmarshal(task.Data, &imageResp) == nil {
		resp.Data = imageResp.Data
		resp.Metadata = imageResp.Metadata
	}
	return resp
}

func respondOpenAIError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"error": types.OpenAIError{
			Message: message,
			Type:    "invalid_request_error",
			Code:    "image_task_error",
		},
	})
}
