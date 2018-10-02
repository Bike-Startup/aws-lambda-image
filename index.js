/**
 * Automatic Image resize, reduce with AWS Lambda
 * Lambda main handler
 *
 * @author Yoshiaki Sugimoto
 * @created 2015/10/29
 */
"use strict";

const ImageProcessor = require("./lib/ImageProcessor");
const S3FileSystem   = require("./lib/S3FileSystem");
const eventParser    = require("./lib/EventParser");
const Config         = require("./lib/Config");
const fs             = require("fs");
const path           = require("path");
const request        = require('request');


// Lambda Handler
exports.handler = (event, context, callback) => {

    var eventRecord = eventParser(event);
    if (eventRecord) {
        process(eventRecord, callback);
    } else {
        console.log(JSON.stringify(event));
        callback('Unsupported or invalid event');
        return;
    }
};

function process(s3Object, callback) {
    const configPath = path.resolve(__dirname, "config.json");
    const fileSystem = new S3FileSystem();
    const processor  = new ImageProcessor(fileSystem, s3Object);
    const config     = new Config(
        JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }))
    );

    processor.run(config)
    .then((processedImages) => {
        const message = "OK, " + processedImages + " images were processed.";
        console.log(message);
        callback(null, message);

        // call remote api
        // -----------------------------------------------------------------------------------------------
        let options;

        const headers = {
          'Content-Type':'application/json'
        }

        const strKey         = s3Object.object.key;
        const arrResultLey   = strKey.split('/');
        const resultEnv      = arrResultLey[0];
        const resultFileUUID = arrResultLey[3];
        const resultFileName = arrResultLey[4];

        const postJsonData = {
            file_uuid : resultFileUUID,
            file_name : resultFileName,
            status    : 'complete'
        };

        const auth = {
            user    : 'roadquest',
            password: 'touge'
        }

        let   rqHost           = 'https://www.road-quest.bike';
        const rqHostProduction = 'https://www.road-quest.bike';
        const rqHostStaging    = 'https://staging.road-quest.bike';
        const endPoint         = '/api/v1/posts/update_image_process_status';

        switch(resultEnv){
            case 'production':
                rqHost = rqHostProduction + endPoint;
                options = {
                    uri: rqHost,
                    headers: headers,
                    json: postJsonData
                }
                break;
            case 'staging':
                rqHost = rqHostStaging + endPoint;
                options = {
                    uri: rqHost,
                    headers: headers,
                    auth: auth,
                    json: postJsonData
                }
                break;
            default:
                rqHost = rqHostStaging + endPoint;
                options = {
                    uri: rqHost,
                    headers: headers,
                    json: postJsonData
                }
                break;
        }

        request.post(options, function(error, response, body){
            //callback
        });

        // -----------------------------------------------------------------------------------------------\
        // end :call remote api

        return;
    })
    .catch((messages) => {
        if ( messages === "Object was already processed." ) {
            console.log("Image already processed");
            callback(null, "Image already processed");
            return;
        } else if ( messages === "Empty file or directory." ) {
            console.log( "Image file is broken or it's a folder" );
            callback( null, "Image file is broken or it's a folder" );
            return;
        } else {
            callback("Error processing " + s3Object.object.key + ": " + messages);
            return;
        }
    });
}
