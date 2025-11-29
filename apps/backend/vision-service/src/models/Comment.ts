import mongoose, { Document, Schema } from 'mongoose';

// Nested reply interface
export interface ICommentReply {
  _id?: string;
  name: string;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
  replies?: ICommentReply[];
}

export interface IComment extends Document {
  name: string;
  comment: string;
  trainingId: string;
  section?: string;
  replies?: ICommentReply[];
  createdAt: Date;
  updatedAt: Date;
}

// Define reply schema with mixed type for unlimited nesting
const replySchemaDefinition = {
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  replies: [], // Mixed type allows unlimited nesting
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
};

const CommentReplySchema = new Schema(replySchemaDefinition, { _id: true });

const CommentSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    trainingId: {
      type: String,
      required: true,
      index: true
    },
    section: {
      type: String,
      trim: true,
      maxlength: 50
    },
    replies: [CommentReplySchema] // Nested replies
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
CommentSchema.index({ trainingId: 1, createdAt: -1 });

export default mongoose.model<IComment>('comment', CommentSchema);