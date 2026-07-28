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
