import { createContext } from 'react';
export const auditFlagDefaults = {
  'audit-live-stream': false,
  'audit-data-export': false,
  'audit-new-search': false,
  'audit-sensitive-data-view': false,
  'audit-dlq-replay': false,
};
export type AuditFlag = keyof typeof auditFlagDefaults;
export const FlagContext = createContext({
  flags: auditFlagDefaults,
  status: 'disabled',
});
