package model

import (
	"encoding/json"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type ImageGenerationLog struct {
	ID         int64      `json:"id" gorm:"primary_key;AUTO_INCREMENT"`
	CreatedAt  int64      `json:"created_at" gorm:"bigint;index:idx_image_generation_logs_created_at_id,priority:2;index:idx_image_generation_logs_user_created,priority:2"`
	UpdatedAt  int64      `json:"updated_at" gorm:"bigint"`
	FinishedAt int64      `json:"finished_at" gorm:"bigint;index"`
	UserId     int        `json:"user_id" gorm:"index;index:idx_image_generation_logs_user_created,priority:1;index:idx_image_generation_logs_user_token_created,priority:1"`
	TokenId    int        `json:"token_id" gorm:"default:0;index;index:idx_image_generation_logs_user_token_created,priority:2"`
	TokenName  string     `json:"token_name" gorm:"type:varchar(191);index;default:''"`
	TaskID     string     `json:"task_id" gorm:"type:varchar(191);uniqueIndex"`
	Action     string     `json:"action" gorm:"type:varchar(40);index"`
	Model      string     `json:"model" gorm:"type:varchar(191);index"`
	Prompt     string     `json:"prompt" gorm:"type:text"`
	Status     TaskStatus `json:"status" gorm:"type:varchar(20);index"`
	Error      string     `json:"error" gorm:"column:error_message;type:text"`
	ImageUrls  string     `json:"image_urls" gorm:"type:text"`
}

type ImageGenerationLogQueryParams struct {
	TokenID        int
	TaskID         string
	Status         string
	Model          string
	StartTimestamp int64
	EndTimestamp   int64
}

func (log *ImageGenerationLog) SetImageURLs(urls []string) {
	if len(urls) == 0 {
		log.ImageUrls = ""
		return
	}
	bytes, _ := common.Marshal(urls)
	log.ImageUrls = string(bytes)
}

func (log *ImageGenerationLog) GetImageURLs() []string {
	if log == nil || log.ImageUrls == "" {
		return nil
	}
	var urls []string
	if err := json.Unmarshal([]byte(log.ImageUrls), &urls); err != nil {
		return nil
	}
	return urls
}

func CreateImageGenerationLog(log *ImageGenerationLog) error {
	if log == nil {
		return nil
	}
	return DB.Create(log).Error
}

func UpdateImageGenerationLog(taskID string, status TaskStatus, finishedAt int64, errorMessage string, imageURLs []string) error {
	if taskID == "" {
		return nil
	}
	updates := map[string]any{
		"status":     status,
		"updated_at": common.GetTimestamp(),
	}
	if finishedAt > 0 {
		updates["finished_at"] = finishedAt
	}
	if errorMessage != "" {
		updates["error_message"] = errorMessage
	}
	if imageURLs != nil {
		if len(imageURLs) == 0 {
			updates["image_urls"] = ""
		} else {
			bytes, _ := common.Marshal(imageURLs)
			updates["image_urls"] = string(bytes)
		}
	}
	return DB.Model(&ImageGenerationLog{}).Where("task_id = ?", taskID).Updates(updates).Error
}

func GetUserImageGenerationLogs(userId int, startIdx int, num int, queryParams ImageGenerationLogQueryParams) ([]*ImageGenerationLog, error) {
	logs := make([]*ImageGenerationLog, 0)
	err := buildImageGenerationLogQuery(userId, queryParams).
		Order("id desc").
		Limit(num).
		Offset(startIdx).
		Find(&logs).Error
	return logs, err
}

func CountUserImageGenerationLogs(userId int, queryParams ImageGenerationLogQueryParams) (int64, error) {
	var total int64
	err := buildImageGenerationLogQuery(userId, queryParams).
		Model(&ImageGenerationLog{}).
		Count(&total).Error
	return total, err
}

func buildImageGenerationLogQuery(userId int, queryParams ImageGenerationLogQueryParams) *gorm.DB {
	tx := DB.Where("user_id = ?", userId)
	if queryParams.TokenID > 0 {
		tx = tx.Where("token_id = ?", queryParams.TokenID)
	}
	if queryParams.TaskID != "" {
		tx = tx.Where("task_id = ?", queryParams.TaskID)
	}
	if queryParams.Status != "" {
		tx = tx.Where("status = ?", queryParams.Status)
	}
	if queryParams.Model != "" {
		tx = tx.Where("model = ?", queryParams.Model)
	}
	if queryParams.StartTimestamp > 0 {
		tx = tx.Where("created_at >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp > 0 {
		tx = tx.Where("created_at <= ?", queryParams.EndTimestamp)
	}
	return tx
}
