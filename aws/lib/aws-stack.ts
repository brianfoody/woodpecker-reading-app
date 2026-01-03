import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";

export class AwsStack extends cdk.Stack {
  public standardStoryBucket: cdk.aws_s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.standardStoryBucket = new cdk.aws_s3.Bucket(
      this,
      "StoryStandardFolder",
      {
        publicReadAccess: true,
        blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
        encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        cors: [
          {
            allowedMethods: [
              cdk.aws_s3.HttpMethods.GET,
              cdk.aws_s3.HttpMethods.HEAD,
            ],
            allowedHeaders: ["*"],
            allowedOrigins: ["*"],
            exposedHeaders: [
              "x-amz-server-side-encryption",
              "x-amz-request-id",
              "x-amz-id-2",
              "ETag",
            ],
            maxAge: 3000,
          },
        ],
      }
    );

    new cdk.aws_cloudfront.Distribution(this, "imageDist", {
      defaultBehavior: {
        origin: new cdk.aws_cloudfront_origins.S3Origin(
          this.standardStoryBucket
        ),
        cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
    });

    new cdk.CfnOutput(this, "storyImagesBucket", {
      value: this.standardStoryBucket.bucketName,
    });
  }
}
