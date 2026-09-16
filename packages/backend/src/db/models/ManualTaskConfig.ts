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

export class ManualTaskConfig extends Model<
    InferAttributes<ManualTaskConfig>,
    InferCreationAttributes<ManualTaskConfig>
> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    declare taskId: CreationOptional<number>;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    declare durationSeconds: number;

    // ── Associations ──

    @BelongsTo(() => IrrigationTask, {
        foreignKey: { name: 'taskId', onDelete: 'CASCADE' },
        targetKey: 'id',
        inverse: {
            type: 'hasOne',
            as: 'manualTaskConfig',
        },
        foreignKeyConstraints: true,
    })
    declare task: NonAttribute<IrrigationTask>;
}
