import Sequelize from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';
import { AggregatedData } from './models/AggregatedData.js';
import { CalibrationPoint } from './models/CalibrationPoint.js';
import { HumidityTaskConfig } from './models/HumidityTaskConfig.js';
import { IrrigationTask } from './models/IrrigationTask.js';
import { ManualTaskConfig } from './models/ManualTaskConfig.js';
import { RawReading } from './models/RawReading.js';
import { RawSensorReading } from './models/RawSensorReading.js';
import { Sensor } from './models/Sensor.js';
import { TimedTaskConfig } from './models/TimedTaskConfig.js';

// Docker 部署时设置环境变量 DB_STORAGE=/data/data.sqlite 使用持久化文件存储，
// pnpm start 时不设置该变量，默认使用开发用文件存储（避免内存库连接池数据丢失）。
const storage = process.env.DB_STORAGE ?? './data.sqlite';

export const db = new Sequelize({
    dialect: SqliteDialect,
    storage,
    define: {
        timestamps: false,
        noPrimaryKey: false,
    },
    pool: {
        // 单连接池，避免 SQLite 锁冲突
        max: 1,
        min: 1,
        // 不回收空闲连接 (SQLite 文件模式下安全，内存模式下必需)
        idle: Infinity,
    },
    models: [
        AggregatedData,
        CalibrationPoint,
        HumidityTaskConfig,
        IrrigationTask,
        ManualTaskConfig,
        RawReading,
        RawSensorReading,
        Sensor,
        TimedTaskConfig,
    ],
});
