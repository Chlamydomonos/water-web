import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    NonAttribute,
    Op,
} from '@sequelize/core';
import {
    AfterSync,
    Attribute,
    AutoIncrement,
    BelongsTo,
    Default,
    HasMany,
    HasOne,
    Index,
    NotNull,
    PrimaryKey,
} from '@sequelize/core/decorators-legacy';
import { HumidityTaskConfig } from './HumidityTaskConfig.js';
import { ManualTaskConfig } from './ManualTaskConfig.js';
import { TimedTaskConfig } from './TimedTaskConfig.js';

export class IrrigationTask extends Model<InferAttributes<IrrigationTask>, InferCreationAttributes<IrrigationTask>> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    @AutoIncrement
    declare id: CreationOptional<number>;

    @Attribute(DataTypes.STRING)
    @NotNull
    @Index({ name: 'irrigation_tasks_type_state' })
    declare type: 'manual' | 'humidity' | 'timed';

    @Attribute(DataTypes.STRING)
    @NotNull
    @Default('idle')
    @Index
    @Index({ name: 'irrigation_tasks_type_state' })
    declare state: CreationOptional<string>;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    declare priority: 0 | 1 | 2;

    @Attribute(DataTypes.INTEGER)
    declare suspendedByTaskId: number | null;

    @Attribute(DataTypes.DATE)
    @NotNull
    @Default(DataTypes.NOW)
    declare createdAt: CreationOptional<Date>;

    @Attribute(DataTypes.DATE)
    declare startedAt: Date | null;

    @Attribute(DataTypes.DATE)
    declare endedAt: Date | null;

    // ── Associations ──

    @HasOne(() => ManualTaskConfig, {
        foreignKey: { name: 'taskId', onDelete: 'CASCADE' },
        sourceKey: 'id',
        inverse: {
            as: 'task',
        },
        foreignKeyConstraints: true,
    })
    declare manualTaskConfig: NonAttribute<ManualTaskConfig>;

    @HasOne(() => HumidityTaskConfig, {
        foreignKey: { name: 'taskId', onDelete: 'CASCADE' },
        sourceKey: 'id',
        inverse: {
            as: 'task',
        },
        foreignKeyConstraints: true,
    })
    declare humidityTaskConfig: NonAttribute<HumidityTaskConfig>;

    @HasOne(() => TimedTaskConfig, {
        foreignKey: { name: 'taskId', onDelete: 'CASCADE' },
        sourceKey: 'id',
        inverse: {
            as: 'task',
        },
        foreignKeyConstraints: true,
    })
    declare timedTaskConfig: NonAttribute<TimedTaskConfig>;

    /** 哪些低优先级任务被本任务暂停 */
    @HasMany(() => IrrigationTask, {
        foreignKey: { name: 'suspendedByTaskId', onDelete: 'SET NULL' },
        sourceKey: 'id',
        inverse: {
            as: 'suspendedByTask',
        },
        foreignKeyConstraints: true,
    })
    declare suspendedTasks: NonAttribute<IrrigationTask[]>;

    /** 被哪个高优先级任务暂停 */
    @BelongsTo(() => IrrigationTask, {
        foreignKey: { name: 'suspendedByTaskId', onDelete: 'SET NULL' },
        targetKey: 'id',
        inverse: {
            type: 'hasMany',
            as: 'suspendedTasks',
        },
        foreignKeyConstraints: true,
    })
    declare suspendedByTask: NonAttribute<IrrigationTask | null>;

    // ── Constraints ──

    @AfterSync
    static async onSync() {
        await this.sequelize.queryInterface.addConstraint(this.table, {
            fields: ['type'],
            type: 'CHECK',
            where: {
                type: {
                    [Op.in]: ['manual', 'humidity', 'timed'],
                },
            },
        });
        await this.sequelize.queryInterface.addConstraint(this.table, {
            fields: ['priority'],
            type: 'CHECK',
            where: {
                priority: {
                    [Op.in]: [0, 1, 2],
                },
            },
        });
    }
}
