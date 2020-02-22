
/* darksky2influxdb
 * Stores weather forcecast data from darkskyapi into a influxdb database
 *
 * By SvenSommer https://github.com/SvenSommer
 * based on ErwinSteffens project https://github.com/ErwinSteffens/darksky-influxdb
 * MIT Licensed.
 */

const Influx = require('influx'),
    config = require('config'),
    cron = require('node-cron'),
    DarkSky = require('darksky-node/lib/darksky-api')

const generalConfig = config.get('general'),
    influxConfig = config.get('influxdb'),
    darkskyConfig = config.get('darksky')

if (!darkskyConfig.key) {
    throw new Error('DarkSky key should be provided')
}

const influx = new Influx.InfluxDB({
    host: influxConfig.host,
    database: influxConfig.database,
    username: influxConfig.username,
    password: influxConfig.password,
    schema: [
        {
            measurement: 'forecast',
            tags: ['source', 'location'],
            fields: {
                precipIntensity: Influx.FieldType.FLOAT,
                precipProbability: Influx.FieldType.FLOAT,
                temperature: Influx.FieldType.FLOAT,
                apparent_temperature: Influx.FieldType.FLOAT,
                dew_point: Influx.FieldType.FLOAT,
                humidity: Influx.FieldType.FLOAT,
                wind_speed: Influx.FieldType.FLOAT,
                wind_bearing: Influx.FieldType.FLOAT,
                cloud_cover: Influx.FieldType.FLOAT,
                sun_cover: Influx.FieldType.FLOAT,
                pressure: Influx.FieldType.FLOAT,
                ozone: Influx.FieldType.FLOAT,
                daytime: Influx.FieldType.BOOLEAN,
                daytime_show: Influx.FieldType.FLOAT,
                nightime_show: Influx.FieldType.FLOAT

            }
        }
    ]
})

const darksky = new DarkSky(darkskyConfig.key);

var getForecasts = function() {
    for (const location of darkskyConfig.locations) {
        getForecast(location.latitude, location.longitude, location.name)
    }
}

var getForecast = function (latitude, longitude, locationName) {
    darksky.forecast(latitude, longitude, {
        exclude: ['minutely', 'currently', 'alerts', 'flags'],
        units: darkskyConfig.units,
        lang: darkskyConfig.language,
        extend: 'hourly'

    }, function (err, responseBody) {
        if (err) {
            console.error('Error while requesting darksky forecast', err)
        }
        else {
            var forecast = JSON.parse(responseBody)


            var daily = forecast.daily;
            var hourly = forecast.hourly;

            if (generalConfig.debug) {
                console.dir(hourly)
            }

            console.log('Writing '+ hourly.data.length +' Datapoints to InfluxDB in Database "' + influxConfig.database + '" with measurement "forecast" on ' + influxConfig.host);
             for (var i = 0, len = hourly.data.length; i < len; ++i) {
                 var fc = hourly.data[i];

                 var daytime = false;
                 for (var j = 0, len_d = daily.data.length; j < len_d; ++j) {
                     var day = daily.data[j]

                     if (fc.time > day.sunriseTime && fc.time < day.sunsetTime) {
                        daytime = true;
                     }
                 }
                 var daytime_show = -10;
                 var nightime_show = 0;

                 var sun_cover = 1-fc.cloudCover;
                 if (!daytime) {
                     sun_cover = 0;
                     daytime_show = 0;
                     nightime_show = -10;
                 }

                var points = [
                    {
                        measurement: 'forecast',
                        fields: {
                            precipIntensity: fc.precipIntensity,
                            precipProbability: fc.precipProbability,
                            temperature: fc.temperature,
                            apparent_temperature: fc.apparentTemperature,
                            dew_point: fc.dewPoint,
                            humidity: fc.humidity,
                            wind_speed: fc.windSpeed,
                            wind_bearing: fc.windBearing,
                            cloud_cover: fc.cloudCover,
                            sun_cover: sun_cover,
                            pressure: fc.pressure,
                            ozone: fc.ozone,
                            daytime: daytime,
                            daytime_show: daytime_show,
                            nightime_show: nightime_show
                        },
                        tags: {
                            source: 'darksky',
                            location: locationName
                        },
                        timestamp:fc.time + '000000000'
                    }
                ];
                if (generalConfig.debug) {
                    console.log('Writing Point ' + i + ':');
                    console.log('Temperature    : ' + fc.temperature);
                    console.log('timestamp      : ' + fc.time + '000000000');
                    console.log('daytime        : ' + daytime);
                }

                influx.writePoints(points).catch(err => {
                    console.error('Error writing to InfluxDB', err)
                })

                if (generalConfig.get("write_history")) {
                    for (point of points) {
                        point.measurement = 'forecast_history'
                        point.tags.forecast_time_tag = fc.time
                        point.fields.forecast_time_field = fc.time
                    }
                    influx.writePoints(points).catch(err => {
                        console.error('Error writing history to InfluxDB', err)
                    })
                }

            }
        }
    })
}

if (generalConfig.cron) {
    cron.schedule(generalConfig.cron, function(){
        getForecasts();
    });

    console.log(`DarkSky data will be written to InfluxDB on cron interval '${generalConfig.cron}'`);
} else {
    getForecasts();

    console.log('DarkSky data is written to InfluxDB');
}
