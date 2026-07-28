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
    Default,
    HasMany,
    Index,
    NotNull,
    PrimaryKey,
} from '@sequelize/core/decorators-legacy';
import { RawSensorReading } from './RawSensorReading.js';

export class RawReading extends Model<InferAttributes<RawReading>, InferCreationAttributes<RawReading>> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    @AutoIncrement
    declare id: CreationOptional<number>;

    @Attribute(DataTypes.DATE)
    @NotNull
    @Index
    declare timestamp: Date;

    @Attribute(DataTypes.DOUBLE)
    declare avgMoisture: number | null;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    declare valveState: 0 | 1;

    @Attribute(DataTypes.DATE)
    @NotNull
    @Default(DataTypes.NOW)
    declare createdAt: CreationOptional<Date>;

    // ── Associations ──

    @HasMany(() => RawSensorReading, {
        foreignKey: { name: 'readingId', onDelete: 'CASCADE' },
        sourceKey: 'id',
        inverse: {
            as: 'rawReading',
        },
        foreignKeyConstraints: true,
    })
    declare rawSensorReadings: NonAttribute<RawSensorReading[]>;

    // ── Constraints ──

    @AfterSync
    static async onSync() {
        await this.sequelize.queryInterface.addConstraint(this.table, {
            fields: ['valveState'],
            type: 'CHECK',
            where: {
                valveState: {
                    [Op.in]: [0, 1],
                },
            },
        });
    }
}
