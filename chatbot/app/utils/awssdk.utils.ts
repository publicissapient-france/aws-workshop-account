import {APIVersions, ConfigurationOptions} from "aws-sdk/lib/config";
import * as AWS from 'aws-sdk';

const conf: ConfigurationOptions & APIVersions = {
  region: "eu-west-1",
  apiVersions: {
    cloudwatch: '2010-08-01',
    dynamodb: '2012-08-10',
    lambda: '2015-03-31',
    organizations: '2016-11-28',
    s3: '2006-03-01'
  }
};

AWS.config.update(conf);

export default AWS;
