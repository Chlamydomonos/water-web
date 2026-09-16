import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    NonAttribute,
} from '@sequelize/core';
import {
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
}
