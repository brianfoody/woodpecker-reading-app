import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
} from "@aws-sdk/client-s3";

type ProviderConfig = {
  region: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

type ProviderPorts = {
  config: ProviderConfig;
};

type OurS3Client = {
  client: S3Client;
  uploadFile: (props: {
    key: string;
    contents: string;
    encoding?: string;
  }) => Promise<void>;
};

export const makeS3Client = <T>({ config }: ProviderPorts): OurS3Client => {
  let client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      accountId: config.accountId,
    },
    region: config.region,
  });

  return {
    client: client,
    uploadFile: async (props) => {
      const { key, contents } = props;

      const params: PutObjectCommandInput = {
        Bucket: config.bucket,
        Key: key,
        Body: contents,
      };

      if (props.encoding) {
        params.ContentEncoding = props.encoding;
      }

      await client.send(new PutObjectCommand(params));
    },
  };
};
