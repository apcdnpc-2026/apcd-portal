import { SetMetadata } from '@nestjs/common';

export const WORKFLOW_ACCESS_KEY = 'workflowAccess';

export type WorkflowAccessType = 'VIEW' | 'EDIT' | 'TRANSITION';

export const RequiresWorkflowAccess = (accessType: WorkflowAccessType) =>
  SetMetadata(WORKFLOW_ACCESS_KEY, accessType);
