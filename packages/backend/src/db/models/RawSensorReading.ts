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
    Index,
    NotNull,
    PrimaryKey,
} from '@sequelize/core/decorators-legacy';
import { RawReading } from './RawReading.js';
import { Sensor } from './Sensor.js';

export class RawSensorReading extends Model<
    InferAttributes<RawSensorReading>,
    InferCreationAttributes<RawSensorReading>
> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    @AutoIncrement
    declare id: CreationOptional<number>;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    @Index
    declare readingId: number;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    @Index
    declare sensorId: number;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    declare slaveAddr: number;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    declare pulseCount: number;

    @Attribute(DataTypes.DOUBLE)
    declare moisture: number | null;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    declare crc8Valid: 0 | 1;

    // ── Associations ──

    @BelongsTo(() => RawReading, {
        foreignKey: { name: 'readingId', onDelete: 'CASCADE' },
        targetKey: 'id',
        inverse: {
            type: 'hasMany',
            as: 'rawSensorReadings',
        },
        foreignKeyConstraints: true,
    })
    declare rawReading: NonAttribute<RawReading>;

    @BelongsTo(() => Sensor, {
        foreignKey: { name: 'sensorId', onDelete: 'CASCADE' },
        targetKey: 'id',
        inverse: {
            type: 'hasMany',
            as: 'rawSensorReadings',
        },
        foreignKeyConstraints: true,
    })
    declare sensor: NonAttribute<Sensor>;

    // ── Constraints ──

    @AfterSync
    static async onSync() {
        await this.sequelize.queryInterface.addConstraint(this.table, {
            fields: ['crc8Valid'],
            type: 'CHECK',
            where: {
                crc8Valid: {
                    [Op.in]: [0, 1],
                },
            },
        });
    }
}
