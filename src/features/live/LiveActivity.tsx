import { useEffect } from 'react';
import { usePermissions } from '../../auth/usePermissions';
import { useAppDispatch, useAppSelector } from '../../hooks/store';
import { env } from '../../config/env';
import type { AppDispatch, RootState } from '../../app/store';
import type { TokenSession } from '../../auth/tokenSession';
import { dashboardApi } from '../dashboard/dashboardApi';
import { connectAuditStream } from './auditStream';
import { setLiveEnabled, setLiveStatus } from './liveSlice';
import { useAuditFlag } from '../flags/useAuditFlag';

const startStream =
  () =>
  (
    dispatch: AppDispatch,
    _getState: () => RootState,
    extra: { tokenSession: TokenSession },
  ) =>
    connectAuditStream({
      url: `${env.apiBaseUrl.replace(/\/$/, '')}/audit/stream`,
      session: extra.tokenSession,
      status: (status, message) => dispatch(setLiveStatus({ status, message })),
      refresh: () => dispatch(dashboardApi.util.invalidateTags(['Dashboard'])),
      sessionEnded: () => dispatch(setLiveEnabled(false)),
    });

export function LiveActivity() {
  const dispatch = useAppDispatch();
  const { enabled, status, message } = useAppSelector((state) => state.live);
  const { has } = usePermissions();
  const rollout = useAuditFlag('audit-live-stream');
  const allowed = has('audit:read') && rollout;
  useEffect(() => {
    if (enabled && allowed) return dispatch(startStream());
    if (enabled && !allowed) dispatch(setLiveEnabled(false));
    dispatch(setLiveStatus({ status: 'stopped' }));
  }, [dispatch, enabled, allowed]);
  return (
    <section className="panel" aria-label="Live activity connection">
      <h2>Live activity</h2>
      {!rollout && <p>Live activity is not enabled for this session.</p>}
      <p role={enabled ? 'status' : undefined}>Connection: {status}</p>
      {message && (
        <p role={status === 'error' ? 'alert' : undefined}>{message}</p>
      )}
      <button
        type="button"
        disabled={!allowed}
        onClick={() => dispatch(setLiveEnabled(!enabled))}
      >
        {enabled ? 'Stop live activity' : 'Start live activity'}
      </button>
      {enabled && status === 'error' && (
        <button
          type="button"
          onClick={() => {
            dispatch(setLiveEnabled(false));
          }}
        >
          Reset live connection
        </button>
      )}
    </section>
  );
}
