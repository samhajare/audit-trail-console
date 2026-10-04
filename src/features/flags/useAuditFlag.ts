import { useContext } from 'react';
import { FlagContext, type AuditFlag } from './flagContext';
export function useAuditFlag(flag: AuditFlag) {
  return useContext(FlagContext).flags[flag];
}
