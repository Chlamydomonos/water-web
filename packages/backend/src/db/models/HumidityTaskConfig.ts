import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    NonAttribute,
} from '@sequelize/core';
import { Attribute, BelongsTo, NotNull, PrimaryKey } from '@sequelize/core/decorators-legacy';
import { IrrigationTask } from './IrrigationTask.js';

export class HumidityTaskConfig extends Model<
    InferAttributes<HumidityTaskConfig>,
    InferCreationAttributes<HumidityTaskConfig>
> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    declare taskId: CreationOptional<number>;

    @Attribute(DataTypes.DOUBLE)
    @NotNull
    declare lowThreshold: number;

    @Attribute(DataTypes.DOUBLE)
    @NotNull
    declare highThreshold: number;

    // ── 时间阈值 (可选) ──
    // 若设置，则湿度低于 lowThreshold 且当前时间在 [startTime, endTime) 窗口内才启动灌溉
    // 支持跨 0 点：如 startTime="16:00", endTime="08:00" 表示每天 16:00 ~ 次日 08:00
    @Attribute(DataTypes.STRING)
    declare startTime: string | null; // "HH:mm" 或 null

    @Attribute(DataTypes.STRING)
    declare endTime: string | null; // "HH:mm" 或 null

    // ── Associations ──

    @BelongsTo(() => IrrigationTask, {
        foreignKey: { name: 'taskId', onDelete: 'CASCADE' },
        targetKey: 'id',
        inverse: {
            type: 'hasOne',
            as: 'humidityTaskConfig',
        },
        foreignKeyConstraints: true,
    })
    declare task: NonAttribute<IrrigationTask>;
}
