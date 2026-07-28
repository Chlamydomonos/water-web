# API 接口设计

> **文档日期**: 2026-07-26  
> **项目**: ESP32 自动灌溉系统 — Web 控制面板  
> **依赖**: `docs/backend-design.md`、`docs/database-design.md`  
> **风格**: Postful — 全部 POST，路径区分端点，参数在 JSON Body

---

## 目录

1. [概述](#1-概述)
2. [传感器 API](#2-传感器-api)
3. [校准 API](#3-校准-api)
4. [灌溉任务 API](#4-灌溉任务-api)
5. [系统 API](#5-系统-api)
    - [5.1 获取系统综合状态](#51-获取系统综合状态)
    - [5.2 获取阀门状态](#52-获取阀门状态)
    - [5.3 健康检查](#53-健康检查)
6. [历史数据 API](#6-历史数据-api)
7. [Socket.IO 事件](#7-socketio-事件)
8. [错误码参考](#8-错误码参考)
9. [决策日志](#9-决策日志)

---

## 1. 概述

### 1.1 基础信息

| 属性     | 值                                            |
| -------- | --------------------------------------------- |
| Base URL | `http://localhost:3000/api`                   |
| 协议     | HTTP/1.1                                      |
| 方法     | **全部 POST**（`GET /api/health` 为唯一例外） |
| 内容类型 | `application/json`                            |
| 字符编码 | UTF-8                                         |
| 认证     | 暂无（局域网内网环境，后续按需添加）          |

### 1.2 Postful 风格约定

| 约定              | 说明                                                         |
| ----------------- | ------------------------------------------------------------ |
| 所有请求使用 POST | 摒弃 GET/PATCH/DELETE 等方法差异                             |
| 路径区分端点      | 动作语义体现在路径后缀，如 `/sensors/create`、`/tasks/start` |
| 参数进 Body       | `:id` 路径参数一律移入 JSON 请求体，路径中不含动态段         |
| HTTP 状态码       | 始终返回 `200`；仅未处理异常返回 `500`                       |

### 1.3 通用响应格式

```typescript
// 业务成功 / 业务失败 — HTTP 200
{
    success: true;
    data: T; // 具体数据类型见各端点定义
}

{
    success: false;
    error: {
        code: string; // 机器可读错误码，如 "SENSOR_NOT_FOUND"
        message: string; // 人类可读错误描述
    }
}

// 未处理异常 — HTTP 500
{
    success: false;
    error: {
        code: 'INTERNAL_ERROR';
        message: string;
    }
}
```

### 1.4 命名约定

| 约定                 | 示例                                      |
| -------------------- | ----------------------------------------- |
| 路径用名词+动词后缀  | `/api/sensors/create`、`/api/tasks/start` |
| 查询类端点用动词后缀 | `/api/sensors/list`、`/api/system/status` |
| 子资源保持嵌套       | `/api/sensors/calibration/start`          |

### 1.5 类型引用

本文档中的 TypeScript 类型均定义于 `packages/shared/src/`，前后端共享。数据库模型对应关系见 `docs/database-design.md`。

---

## 2. 传感器 API

### 2.1 列出所有传感器

```
POST /api/sensors/list
```

**请求体**：无（可传空对象 `{}`）

**响应**：

```typescript
{
    success: true;
    data: Sensor[];
}

interface Sensor {
    id: number;
    slaveAddr: number;       // 0~15
    name: string;
    faulty: boolean;
    calibrated: boolean;
    calibSlope: number | null;   // 校准参数 a（具体数学模型待硬件实验后确定）
    calibIntercept: number | null; // 校准参数 b（具体数学模型待硬件实验后确定）
    createdAt: string;       // ISO 8601
}
```

---

### 2.2 获取单个传感器

```
POST /api/sensors/detail
```

**请求体**：

```typescript
{
    id: number;
}
```

**响应**：`{ success: true, data: Sensor }`

**业务错误**：

| 错误码             |
| ------------------ |
| `SENSOR_NOT_FOUND` |

---

### 2.3 添加传感器

```
POST /api/sensors/create
```

**请求体**：

```typescript
{
    slaveAddr: number; // 0~15, ESP32 从机地址
    name: string; // 用户自定义名称
}
```

**验证规则**：

| 规则                           | 错误码               |
| ------------------------------ | -------------------- |
| `slaveAddr` 不在 0~15 范围内   | `SLAVE_ADDR_INVALID` |
| `slaveAddr` 已被其他传感器占用 | `SLAVE_ADDR_TAKEN`   |
| `name` 为空或仅空白字符        | `VALIDATION_ERROR`   |

**响应**：`{ success: true, data: Sensor }`

**副作用**：创建成功后自动调用 `syncMaskToEsp32()`，将未添加的从机地址全部屏蔽。

---

### 2.4 更新传感器

```
POST /api/sensors/update
```

**请求体**（所有字段可选）：

```typescript
{
    id: number;
    name?: string;
    faulty?: boolean;
}
```

**响应**：`{ success: true, data: Sensor }`

**副作用**：`faulty` 字段变更时自动触发 `syncMaskToEsp32()`。

**业务错误**：

| 错误码             |
| ------------------ |
| `SENSOR_NOT_FOUND` |

---

### 2.5 删除传感器

```
POST /api/sensors/delete
```

**请求体**：

```typescript
{
    id: number;
}
```

**响应**：

```typescript
{
    success: true;
    data: {
        deleted: true;
    }
}
```

**副作用**：删除后自动 `syncMaskToEsp32()`。

**业务错误**：

| 错误码             |
| ------------------ |
| `SENSOR_NOT_FOUND` |

---

## 3. 校准 API

> 所有校准端点均嵌套在传感器路径下：`/api/sensors/calibration/...`。  
> `sensorId` 通过请求体传递。校准期间的行为约束详见 `backend-design.md` §3.4.2。

### 3.1 进入校准模式

```
POST /api/sensors/calibration/start
```

**请求体**：

```typescript
{
    sensorId: number;
}
```

**响应**：

```typescript
{
    success: true;
    data: {
        status: 'calibrating';
    }
}
```

**副作用**：暂停所有灌溉任务。

**业务错误**：

| 错误码                       |
| ---------------------------- |
| `SENSOR_NOT_FOUND`           |
| `CALIBRATION_IN_PROGRESS`    |
| `SENSOR_ALREADY_CALIBRATING` |

---

### 3.2 退出校准模式

```
POST /api/sensors/calibration/stop
```

**请求体**：

```typescript
{
    sensorId: number;
}
```

**响应**：

```typescript
{
    success: true;
    data: {
        status: 'idle';
    }
}
```

**副作用**：按优先级规则恢复灌溉任务。

**业务错误**：

| 错误码             |
| ------------------ |
| `SENSOR_NOT_FOUND` |
| `NOT_CALIBRATING`  |

---

### 3.3 提交校准数据点

```
POST /api/sensors/calibration/submit-data
```

**请求体**：

```typescript
{
    sensorId: number;
    actualMoisture: number; // 用户测量的实际含水量 (如 0.25 表示 25%)
}
```

**响应**：

```typescript
{
    success: true;
    data: CalibrationPoint;
}

interface CalibrationPoint {
    id: number;
    sensorId: number;
    pulseCount: number; // 后端自动读取最近一次采集的脉冲计数
    actualMoisture: number;
    createdAt: string;
}
```

**处理流程**：

1. 校验传感器处于校准模式
2. 从 `RawSensorReading` 读取该传感器最近一条的 `pulse_count`
3. 创建 `CalibrationPoint(pulseCount, actualMoisture)`

**业务错误**：

| 错误码             |
| ------------------ |
| `SENSOR_NOT_FOUND` |
| `NOT_CALIBRATING`  |
| `NO_PULSE_DATA`    |

---

### 3.4 计算校准公式

```
POST /api/sensors/calibration/calculate
```

**请求体**：

```typescript
{
    sensorId: number;
}
```

**响应**：

```typescript
{
    success: true;
    data: {
        slope: number; // 校准参数 a
        intercept: number; // 校准参数 b
        rSquared: number; // 拟合优度 R²
        pointCount: number; // 参与计算的数据点数
    }
}
```

**处理流程**：

1. 读取该传感器的全部 `CalibrationPoint`
2. 若数据点 < 2 → 返回 `INSUFFICIENT_CALIB_DATA`
3. 进行回归拟合，计算 `slope` 和 `intercept`（具体拟合模型待硬件实验后确定）
4. 将结果写入 `Sensor.calib_slope`、`Sensor.calib_intercept`，设置 `calibrated = true`
5. 推送 Socket.IO 事件 `sensor:changed`

**业务错误**：

| 错误码                    |
| ------------------------- |
| `SENSOR_NOT_FOUND`        |
| `NOT_CALIBRATING`         |
| `INSUFFICIENT_CALIB_DATA` |

---

### 3.5 查看校准状态

```
POST /api/sensors/calibration/status
```

**请求体**：

```typescript
{
    sensorId: number;
}
```

**响应**：

```typescript
{
    success: true;
    data: {
        sensorId: number;
        calibrating: boolean;        // 当前是否在校准模式
        calibrated: boolean;         // 是否已有生效的校准公式
        formula: {                   // 仅 calibrated=true 时有值
            slope: number;
            intercept: number;
        } | null;
        points: CalibrationPoint[];  // 历史数据点列表
    };
}
```

---

## 4. 灌溉任务 API

### 4.1 列出所有任务

```
POST /api/tasks/list
```

**请求体**：

```typescript
{
    state?: string;   // 按状态过滤，如 "running"
}
```

**响应**：

```typescript
{
    success: true;
    data: IrrigationTask[];
}

interface IrrigationTask {
    id: number;
    type: "manual" | "humidity" | "timed";
    state: "idle" | "running" | "paused" | "blocked" | "completed" | "cancelled";
    priority: number;         // 0=MANUAL, 1=HUMIDITY, 2=TIMED
    suspendedByTaskId: number | null;
    config: ManualTaskConfig | HumidityTaskConfig | TimedTaskConfig;
    createdAt: string;
    startedAt: string | null;
    endedAt: string | null;
}
```

---

### 4.2 创建任务

```
POST /api/tasks/create
```

**请求体**（`type` 决定 `config` 结构）：

```typescript
// MANUAL 类型
{
    type: "manual";
    config: {
        durationSeconds: number;   // > 0
    };
}

// HUMIDITY 类型
{
    type: "humidity";
    config: {
        lowThreshold: number;     // 启动灌溉阈值
        highThreshold: number;    // 停止灌溉阈值, 必须 > lowThreshold
    };
}

// TIMED 类型
{
    type: "timed";
    config: {
        startTime: string;        // "HH:mm", 如 "06:00"
        endTime: string;          // "HH:mm", 必须 > startTime
        daysOfWeek: number[];     // [1,3,5] = 周一三五, 1~7
    };
}
```

**响应**：`{ success: true, data: IrrigationTask }`

**业务错误**：

| 错误码                    |
| ------------------------- |
| `VALIDATION_ERROR`        |
| `DUPLICATE_HUMIDITY_TASK` |
| `TIME_CONFLICT`           |
| `CALIBRATION_IN_PROGRESS` |

---

### 4.3 更新任务配置

```
POST /api/tasks/update
```

**请求体**（整体替换，所有字段必填）：

```typescript
{
    id: number;
    config: ManualTaskConfig | HumidityTaskConfig | TimedTaskConfig;
}
```

**允许更新的状态**：`idle`、`paused`

**响应**：`{ success: true, data: IrrigationTask }`

**业务错误**：

| 错误码               |
| -------------------- |
| `TASK_NOT_FOUND`     |
| `TASK_CANNOT_UPDATE` |
| `TIME_CONFLICT`      |

---

### 4.4 删除任务

```
POST /api/tasks/delete
```

**请求体**：

```typescript
{
    id: number;
}
```

**允许删除的状态**：`idle`、`completed`、`cancelled`

**响应**：`{ success: true, data: { deleted: true } }`

**业务错误**：

| 错误码               |
| -------------------- |
| `TASK_NOT_FOUND`     |
| `TASK_CANNOT_DELETE` |

---

### 4.5 手动启动任务

```
POST /api/tasks/start
```

**请求体**：

```typescript
{
    id: number;
}
```

**适用**：仅 `type = "manual"` 且 `state = "idle"` 的任务。

**响应**：`{ success: true, data: IrrigationTask }`

**副作用**：按优先级调度规则暂停低优先级运行中任务。

**业务错误**：

| 错误码              |
| ------------------- |
| `TASK_NOT_FOUND`    |
| `TASK_CANNOT_START` |

---

### 4.6 暂停任务

```
POST /api/tasks/pause
```

**请求体**：

```typescript
{
    id: number;
}
```

**适用**：`state = "running"` 的任务。

**响应**：`{ success: true, data: IrrigationTask }`

---

### 4.7 恢复任务

```
POST /api/tasks/resume
```

**请求体**：

```typescript
{
    id: number;
}
```

**适用**：`state = "paused"` 的任务。

**响应**：`{ success: true, data: IrrigationTask }`

**副作用**：若为 humidity 任务，恢复后按阻塞规则将 timed 任务置为 `blocked`。

---

### 4.8 取消任务

```
POST /api/tasks/cancel
```

**请求体**：

```typescript
{
    id: number;
}
```

**适用**：`state` 为 `idle`、`running`、`paused` 的任务。

**响应**：`{ success: true, data: IrrigationTask }`

**副作用**：

- 若为 humidity 任务取消 → 所有 timed 任务解除 `blocked`
- 若该任务是其他任务的 `suspended_by_task_id` → 触发被暂停任务的恢复逻辑

---

### 4.9 手动结束任务

```
POST /api/tasks/stop
```

**请求体**：

```typescript
{
    id: number;
}
```

**适用**：`type = "manual"` 且 `state = "running"` 的任务。提前结束灌溉，不等 `durationSeconds` 到期。

**响应**：`{ success: true, data: IrrigationTask }`

**副作用**：恢复被该任务暂停的低优先级任务。

---

## 5. 系统 API

### 5.1 获取系统综合状态

```
POST /api/system/status
```

**请求体**：无（可传空对象 `{}`）

**响应**：

```typescript
{
    success: true;
    data: {
        espConnected: boolean;
        valveState: 0 | 1;
        activeTaskCount: number; // state=running 的任务数
        activeTask: IrrigationTask | null; // 当前最高优先级活跃任务
        healthySensorCount: number; // faulty=false 的传感器数
        calibratedSensorCount: number; // calibrated=true 的传感器数
        calibrationInProgress: boolean;
        lastCollectionTime: string | null; // 最近一次成功采集的 ISO 时间
    }
}
```

---

### 5.2 获取阀门状态

```
POST /api/system/valve/status
```

**请求体**：无（可传空对象 `{}`）

**响应**：

```typescript
{
    success: true;
    data: {
        state: 0 | 1;
    }
}
```

---

### 5.3 健康检查

```
GET /api/health
```

> **注意**：这是项目中唯一使用 GET 方法的端点，不遵循 Postful 约定。

**请求体**：无

**响应**：

```typescript
{
    status: 'ok';
    timestamp: number; // Unix 毫秒时间戳
}
```

**CORS**：该端点设置 `Access-Control-Allow-Origin: *`，允许任意来源的跨域请求，用于外部探活（如 Docker healthcheck、负载均衡器、监控系统等）。其他 API 端点不受影响，仍保持同源策略。

**用途**：检测后端服务是否正常运行，不依赖数据库、ESP32 连接等外部资源。

**HTTP 状态码**：正常返回 `200`；若服务未启动则连接被拒绝。

---

## 6. 历史数据 API

### 6.1 查询历史数据

```
POST /api/data/history
```

**请求体**：

```typescript
{
    from: string;          // ISO 8601, 起始时间
    to: string;            // ISO 8601, 结束时间（不包含）
    resolution?: string;   // "raw" / "second" / "hour"。默认按时间范围自动选择
}
```

**自动分辨率选择规则**：

| 时间范围 | 默认分辨率 | 来源表            |
| -------- | :--------: | ----------------- |
| ≤ 1 天   |   `raw`    | `raw_readings`    |
| 1~7 天   |  `second`  | `aggregated_data` |
| 7~30 天  |   `hour`   | `aggregated_data` |

**响应**：

```typescript
{
    success: true;
    data: DataPoint[];
}

interface DataPoint {
    timestamp: string;        // ISO 8601
    avgMoisture: number | null;
    valveState?: 0 | 1;       // 仅 resolution=raw 时包含
}
```

**限制**：`from` 不得早于 30 天前（超出保留期的数据已删除）。

**业务错误**：

| 错误码              |
| ------------------- |
| `VALIDATION_ERROR`  |
| `DATA_OUT_OF_RANGE` |

---

### 6.2 获取最近数据（前端重连补全）

```
POST /api/data/latest
```

**请求体**：

```typescript
{
    minutes?: number;   // 拉取最近 N 分钟的数据，默认 5
}
```

**响应**：

```typescript
{
    success: true;
    data: {
        readings: RawReadingDetail[];  // 最近 N 分钟的完整原始数据
    };
}

interface RawReadingDetail {
    timestamp: string;
    avgMoisture: number | null;
    valveState: 0 | 1;
    sensors: {
        sensorId: number;
        name: string;
        slaveAddr: number;
        pulseCount: number;
        moisture: number | null;
        crc8Valid: boolean;
    }[];
}
```

**说明**：前端在 Socket.IO 重连后调用此端点，快速恢复图表中缺失的数据段。配合延迟推送队列（`backend-design.md` §4.4.1），重连时不出现数据缺口。

---

## 7. Socket.IO 事件

> 所有事件均为 **服务端 → 客户端** 单向推送。  
> 客户端所有操作通过上述 Postful API 完成。

### 7.1 事件清单

| 事件名                    | 触发时机                                      | Payload 类型         |
| ------------------------- | --------------------------------------------- | -------------------- |
| `data:new`                | 每秒从延迟队列释放一条数据                    | `DataSnapshot`       |
| `valve:changed`           | 电磁阀状态变更                                | `ValveChangedEvent`  |
| `task:changed`            | 任务状态变更（创建/启动/暂停/恢复/完成/取消） | `IrrigationTask`     |
| `sensor:changed`          | 传感器增删、故障标记变更、校准完成            | `Sensor`             |
| `calibration:started`     | 进入校准模式                                  | `CalibrationEvent`   |
| `calibration:stopped`     | 退出校准模式                                  | `CalibrationEvent`   |
| `system:esp_connected`    | ESP32 TCP 连接建立                            | `EspConnectionEvent` |
| `system:esp_disconnected` | ESP32 TCP 连接断开                            | `EspConnectionEvent` |
| `system:error`            | 系统级异常                                    | `SystemErrorEvent`   |

### 7.2 事件 Payload 定义

```typescript
// === data:new ===
interface DataSnapshot {
    timestamp: string; // ISO 8601, 已校正的采集时刻
    avgMoisture: number | null;
    valveState: 0 | 1;
    sensors: SensorSnapshot[];
}

interface SensorSnapshot {
    sensorId: number;
    name: string;
    slaveAddr: number;
    pulseCount: number;
    moisture: number | null;
    crc8Valid: boolean;
}

// === valve:changed ===
interface ValveChangedEvent {
    state: 0 | 1;
    triggeredBy: string; // 触发来源: "manual" / "humidity" / "timed" / "system"
}

// === calibration:started / calibration:stopped ===
interface CalibrationEvent {
    sensorId: number;
}

// === system:esp_connected / system:esp_disconnected ===
interface EspConnectionEvent {
    timestamp: string; // ISO 8601
    reason?: string; // 断开时包含原因
}

// === system:error ===
interface SystemErrorEvent {
    code: string;
    message: string;
    timestamp: string;
}
```

---

## 8. 错误码参考

| 错误码                       | 关联端点                                                                                            | 说明                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| `VALIDATION_ERROR`           | 全部含请求体的端点                                                                                  | 请求体字段格式或值无效         |
| `SENSOR_NOT_FOUND`           | `/api/sensors/detail`、`.../update`、`.../delete`、`.../calibration/*`                              | 传感器不存在                   |
| `SLAVE_ADDR_INVALID`         | `/api/sensors/create`                                                                               | 从机地址超出 0~15 范围         |
| `SLAVE_ADDR_TAKEN`           | `/api/sensors/create`                                                                               | 该地址已被占用                 |
| `CALIBRATION_IN_PROGRESS`    | `/api/sensors/calibration/start`、`/api/tasks/create`                                               | 已有传感器在校准中             |
| `SENSOR_ALREADY_CALIBRATING` | `/api/sensors/calibration/start`                                                                    | 该传感器已在校准模式           |
| `NOT_CALIBRATING`            | `/api/sensors/calibration/stop`、`.../submit-data`、`.../calculate`                                 | 传感器未处于校准模式           |
| `NO_PULSE_DATA`              | `/api/sensors/calibration/submit-data`                                                              | 尚无采集数据                   |
| `INSUFFICIENT_CALIB_DATA`    | `/api/sensors/calibration/calculate`                                                                | 数据点 < 2                     |
| `TASK_NOT_FOUND`             | `/api/tasks/update`、`.../delete`、`.../start`、`.../pause`、`.../resume`、`.../cancel`、`.../stop` | 灌溉任务不存在                 |
| `DUPLICATE_HUMIDITY_TASK`    | `/api/tasks/create`                                                                                 | 已存在活跃湿度任务             |
| `TIME_CONFLICT`              | `/api/tasks/create`、`/api/tasks/update`                                                            | 定时任务时间重叠               |
| `TASK_CANNOT_START`          | `/api/tasks/start`                                                                                  | 当前状态不允许启动             |
| `TASK_CANNOT_UPDATE`         | `/api/tasks/update`                                                                                 | 当前状态不允许更新             |
| `TASK_CANNOT_DELETE`         | `/api/tasks/delete`                                                                                 | 当前状态不允许删除             |
| `DATA_OUT_OF_RANGE`          | `/api/data/history`                                                                                 | 查询时间超出数据保留期         |
| `ESP_NOT_CONNECTED`          | `/api/system/valve/control`、`/api/tasks/start`                                                     | ESP32 未连接，无法执行硬件操作 |
| `INTERNAL_ERROR`             | 全部                                                                                                | 未处理异常（HTTP 500）         |

---

## 9. 决策日志

| #   | 决策                                                              | 理由                                                                                                                                                           | 日期       |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | 采用 Postful 风格：全部 POST，路径区分端点，参数进 Body           | 统一请求方式，消除 HTTP 方法语义差异；前端调用只需关心路径和 JSON body，降低对接复杂度；所有业务错误统一通过 `success: false` 表达，HTTP 状态码仅 200/500 两种 | 2026-07-26 |
| 2   | 路径用动作后缀（方案 A）而非资源+动作扁平化                       | 路径即端点标识，动作后缀（如 `/sensors/create`、`/tasks/start`）自描述性强，无需额外路由映射文档                                                               | 2026-07-26 |
| 3   | 保留层级嵌套路径（如 `/api/sensors/calibration/start`）           | 校准是传感器的子资源，嵌套路径表达所有权关系，组织结构清晰                                                                                                     | 2026-07-26 |
| 4   | 请求体不包信封，直接传参                                          | 路径已唯一标识端点，无需在 body 中再嵌套 `action` 字段；扁平 body 减少一层解析                                                                                 | 2026-07-26 |
| 5   | HTTP 仅返回 200 和 500                                            | 所有业务错误（含校验失败、资源不存在等）均以 200 + `success: false` 返回；仅未捕获异常返回 500。前端只需判断 `success` 字段即可分流处理                        | 2026-07-26 |
| 6   | 校准端点挂载在传感器子路径下                                      | 校准是传感器的子资源，`/sensors/calibration/...` 表达清晰的所有权关系                                                                                          | 2026-07-26 |
| 7   | 任务配置更新使用整体替换                                          | 任务配置字段少且耦合紧密（如湿度阈值的 low/high 必须一起改），整体替换避免部分更新导致的不一致状态                                                             | 2026-07-26 |
| 8   | 新增 `POST /api/data/history` 和 `POST /api/data/latest`          | Socket.IO 推送仅覆盖实时数据；前端加载历史图表、重连补全需要拉取接口。`latest` 端点与延迟推送队列协同实现无缝重连                                              | 2026-07-26 |
| 9   | `POST /api/system/valve/control` 直接控制阀门，而非强制走任务 API | 提供轻量级快捷操作入口。用户临时开关节水时不应被强制创建任务记录。内部实现上仍创建瞬时 manual 任务以保证调度一致性                                             | 2026-07-26 |
| 10  | Socket.IO 仅服务端推送                                            | 所有写操作走 Postful API——语义清晰、易于调试、支持重试。Socket.IO 专注于实时状态同步                                                                           | 2026-07-26 |
| 11  | 历史数据查询分辨率自动选择                                        | 用户只需指定时间范围，后端根据保留策略自动选最优分辨率，降低前端对接复杂度                                                                                     | 2026-07-26 |
