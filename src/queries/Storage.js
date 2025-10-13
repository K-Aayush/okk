import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';

dotenv.config();

export default [
  {
    key: 'signS3',
    prototype: '(folder: String!, fileType: String!): SignedUrl',
    mutation: true,
    run: async ({ folder, fileType }) => {
      const s3 = new S3({
        region: process.env.AWS_REGION,
        credentials: fromEnv(),
      });
      const fileName = folder + '/' + nanoid();
      const s3Params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        ContentType: fileType,
        ACL: 'public-read',
      };

      const data = await getSignedUrl(s3, new PutObjectCommand(s3Params), {
        expiresIn: 300,
      });

      return {
        signedRequest: data,
        url: `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${fileName}`,
      };
    },
  },
];
