import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from '@sequelize/core';
import { Attribute, AutoIncrement, Index, NotNull, PrimaryKey } from '@sequelize/core/decorators-legacy';

export class AggregatedData extends Model<InferAttributes<AggregatedData>, InferCreationAttributes<AggregatedData>> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    @AutoIncrement
    declare id: CreationOptional<number>;

    @Attribute(DataTypes.DATE)
    @NotNull
    @Index({ name: 'aggregated_data_resolution_timestamp' })
    declare timestamp: Date;

    @Attribute(DataTypes.STRING)
    @NotNull
    @Index({ name: 'aggregated_data_resolution_timestamp' })
    declare resolution: 'second' | 'hour';

    @Attribute(DataTypes.DOUBLE)
    @NotNull
    declare avgMoisture: number;
}
