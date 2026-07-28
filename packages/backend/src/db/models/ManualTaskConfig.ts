import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    NonAttribute,
    Op,
} from '@sequelize/core';
import { AfterSync, Attribute, BelongsTo, NotNull, PrimaryKey } from '@sequelize/core/decorators-legacy';
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

    // ── Constraints ──

    @AfterSync
    static async onSync() {
        await this.sequelize.queryInterface.addConstraint(this.table, {
            fields: ['durationSeconds'],
            type: 'CHECK',
            where: {
                durationSeconds: {
                    [Op.gt]: 0,
                },
            },
        });
    }
}
