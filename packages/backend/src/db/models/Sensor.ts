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
    Unique,
} from '@sequelize/core/decorators-legacy';
import { CalibrationPoint } from './CalibrationPoint.js';
import { RawSensorReading } from './RawSensorReading.js';

export class Sensor extends Model<InferAttributes<Sensor>, InferCreationAttributes<Sensor>> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    @AutoIncrement
    declare id: CreationOptional<number>;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    @Index({ unique: true })
    declare slaveAddr: number;

    @Attribute(DataTypes.STRING)
    @NotNull
    declare name: string;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    @Default(0)
    declare faulty: CreationOptional<0 | 1>;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    @Default(0)
    declare calibrated: CreationOptional<0 | 1>;

    @Attribute(DataTypes.DOUBLE)
    declare calibA: number | null;

    @Attribute(DataTypes.DOUBLE)
    declare calibB: number | null;

    @Attribute(DataTypes.DATE)
    @NotNull
    @Default(DataTypes.NOW)
    declare createdAt: CreationOptional<Date>;

    // ── Associations ──

    @HasMany(() => CalibrationPoint, {
        foreignKey: { name: 'sensorId', onDelete: 'CASCADE' },
        sourceKey: 'id',
        inverse: {
            as: 'sensor',
        },
        foreignKeyConstraints: true,
    })
    declare calibrationPoints: NonAttribute<CalibrationPoint[]>;

    @HasMany(() => RawSensorReading, {
        foreignKey: { name: 'sensorId', onDelete: 'CASCADE' },
        sourceKey: 'id',
        inverse: {
            as: 'sensor',
        },
        foreignKeyConstraints: true,
    })
    declare rawSensorReadings: NonAttribute<RawSensorReading[]>;

    // ── Constraints ──

    @AfterSync
    static async onSync() {
        await this.sequelize.queryInterface.addConstraint(this.table, {
            fields: ['slaveAddr'],
            type: 'CHECK',
            where: {
                slaveAddr: {
                    [Op.between]: [0, 15],
                },
            },
        });
    }
}
