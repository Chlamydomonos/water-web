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
    BelongsTo,
    Default,
    Index,
    NotNull,
    PrimaryKey,
} from '@sequelize/core/decorators-legacy';
import { Sensor } from './Sensor.js';

export class CalibrationPoint extends Model<
    InferAttributes<CalibrationPoint>,
    InferCreationAttributes<CalibrationPoint>
> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    @AutoIncrement
    declare id: CreationOptional<number>;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    @Index({ name: 'calibration_points_sensor_created_at' })
    declare sensorId: number;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    declare pulseCount: number;

    @Attribute(DataTypes.DOUBLE)
    @NotNull
    declare actualMoisture: number;

    @Attribute(DataTypes.DATE)
    @NotNull
    @Default(DataTypes.NOW)
    @Index({ name: 'calibration_points_sensor_created_at' })
    declare createdAt: CreationOptional<Date>;

    // ── Associations ──

    @BelongsTo(() => Sensor, {
        foreignKey: { name: 'sensorId', onDelete: 'CASCADE' },
        targetKey: 'id',
        inverse: {
            type: 'hasMany',
            as: 'calibrationPoints',
        },
        foreignKeyConstraints: true,
    })
    declare sensor: NonAttribute<Sensor>;
}
