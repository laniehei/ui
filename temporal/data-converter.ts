import type { DataConverter } from '@temporalio/common';

export function getDataConverter(): DataConverter {
  return {
    payloadCodecs: [],
  };
}
