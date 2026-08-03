// ============================================================
// 通用响应格式
// ============================================================

export interface ApiSuccess<T> {
    success: true;
    data: T;
}

export interface ApiError {
    success: false;
    error: {
        code: string;
        message: string;
    };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ============================================================
// 传感器 DTO（API 对外表示）
// ============================================================

export interface SensorDto {
    id: number;
    slaveAddr: number;
    name: string;
    faulty: boolean;
    calibrated: boolean;
    calibA: number | null;
    calibB: number | null;
    createdAt: string;
}

// ============================================================
// 传感器请求体
// ============================================================

export interface SensorCreateRequest {
    slaveAddr: number;
    name: string;
}

export interface SensorUpdateRequest {
    id: number;
    name?: string;
    faulty?: boolean;
}

export interface SensorDetailRequest {
    id: number;
}

export interface SensorDeleteRequest {
    id: number;
}

// ============================================================
// 校准 DTO
// ============================================================

export interface CalibrationPointDto {
    id: number;
    sensorId: number;
    pulseCount: number;
    actualMoisture: number;
    createdAt: string;
}

export interface CalibrationFormula {
    a: number;
    b: number;
}

export interface CalibrationStatusResponse {
    sensorId: number;
    calibrating: boolean;
    calibrated: boolean;
    formula: CalibrationFormula | null;
    points: CalibrationPointDto[];
}

export interface CalibrationCalculateResponse {
    a: number;
    b: number;
    rSquared: number;
    pointCount: number;
}

// ============================================================
// 校准请求体
// ============================================================

export interface CalibrationStartRequest {
    sensorId: number;
}

export interface CalibrationStopRequest {
    sensorId: number;
}

export interface CalibrationSubmitDataRequest {
    sensorId: number;
    actualMoisture: number;
}

export interface CalibrationCalculateRequest {
    sensorId: number;
}

export interface CalibrationStatusRequest {
    sensorId: number;
}

// ============================================================
// 数据采集 — DataSnapshot (Socket.IO 推送)
// ============================================================

export interface SensorSnapshot {
    sensorId: number;
    name: string;
    slaveAddr: number;
    pulseCount: number;
    moisture: number | null;
    crc8Valid: boolean;
}

export interface DataSnapshot {
    timestamp: number;
    avgMoisture: number | null;
    valveState: 0 | 1;
    sensors: SensorSnapshot[];
}

// ============================================================
// 系统状态
// ============================================================

export interface SystemStatus {
    espConnected: boolean;
    valveState: 0 | 1;
    activeTaskCount: number;
    activeTask: IrrigationTaskDto | null;
    healthySensorCount: number;
    calibratedSensorCount: number;
    calibrationInProgress: boolean;
    lastCollectionTime: string | null;
}

// ============================================================
// 灌溉任务 DTO
// ============================================================

export type TaskType = 'manual' | 'humidity' | 'timed';
export type TaskState = 'idle' | 'running' | 'paused' | 'blocked' | 'completed' | 'cancelled';
export type TaskPriority = 0 | 1 | 2;

export interface IrrigationTaskDto {
    id: number;
    type: TaskType;
    state: TaskState;
    priority: TaskPriority;
    suspendedByTaskId: number | null;
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
    config: ManualTaskConfigDto | HumidityTaskConfigDto | TimedTaskConfigDto | null;
}

export interface ManualTaskConfigDto {
    durationSeconds: number;
}

export interface HumidityTaskConfigDto {
    lowThreshold: number;
    highThreshold: number;
    /** 时间阈值（可选）。设置后仅在此时间窗口内且湿度低于阈值才灌溉。支持跨 0 点。 */
    startTime?: string | null; // "HH:mm"
    endTime?: string | null; // "HH:mm"
}

export interface TimedTaskConfigDto {
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
}

// ============================================================
// 灌溉任务请求体
// ============================================================

export interface TaskCreateRequest {
    type: TaskType;
    config: ManualTaskConfigDto | HumidityTaskConfigDto | TimedTaskConfigDto;
}

export interface TaskUpdateRequest {
    id: number;
    config: ManualTaskConfigDto | HumidityTaskConfigDto | TimedTaskConfigDto;
}

export interface TaskActionRequest {
    id: number;
}

export interface TaskListRequest {
    // 可选筛选
    type?: TaskType;
    state?: TaskState;
}

// ============================================================
// 历史数据 API 请求/响应
// ============================================================

export interface HistoryRequest {
    from: string; // ISO 8601
    to: string; // ISO 8601
    resolution?: 'raw' | 'second' | 'hour';
}

export interface LatestDataRequest {
    minutes?: number; // 默认 5
}

export interface DataPoint {
    timestamp: string; // ISO 8601
    avgMoisture: number | null;
    valveState?: 0 | 1; // 仅 resolution=raw 时包含
}

export interface RawReadingDetail {
    timestamp: string;
    avgMoisture: number | null;
    valveState: 0 | 1;
    sensors: SensorSnapshot[];
}

export interface LatestDataResponse {
    readings: RawReadingDetail[];
}
