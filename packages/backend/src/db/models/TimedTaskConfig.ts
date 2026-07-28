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

export class TimedTaskConfig extends Model<InferAttributes<TimedTaskConfig>, InferCreationAttributes<TimedTaskConfig>> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    declare taskId: CreationOptional<number>;

    @Attribute(DataTypes.STRING)
    @NotNull
    declare startTime: string;

    @Attribute(DataTypes.STRING)
    @NotNull
    declare endTime: string;

    @Attribute(DataTypes.STRING)
    @NotNull
    declare daysOfWeek: string;

    // ── Associations ──

    @BelongsTo(() => IrrigationTask, {
        foreignKey: { name: 'taskId', onDelete: 'CASCADE' },
        targetKey: 'id',
        inverse: {
            type: 'hasOne',
            as: 'timedTaskConfig',
        },
        foreignKeyConstraints: true,
    })
    declare task: NonAttribute<IrrigationTask>;
}
