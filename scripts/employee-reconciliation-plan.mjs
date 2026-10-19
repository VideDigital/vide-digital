// Pure, offline planner. No SDK, network, writes, secret reads or CLI execution.
export function planEmployeeReconciliation(s) {
  const stop = message => { throw new Error('HARD STOP: '+message); };
  if (!s || !['emulator','production'].includes(s.environment)) stop('unknown environment');
  if (s.project !== (s.environment === 'production' ? 'vide-digital-saas' : 'demo-vide-hub')) stop('project mismatch');
  if (!s.uid || !s.ownerUid || s.uid === s.ownerUid || s.documentUid !== s.uid || s.documentOwnerUid !== s.ownerUid || s.authUid !== s.uid) stop('identity mismatch');
  if (!s.updateTime || s.updateTime !== s.expectedUpdateTime || !s.syncId || s.syncId !== s.expectedSyncId || s.pending !== true) stop('stale or missing pending operation');
  if (s.inFlight !== false || s.logsReviewed !== true || s.adminIntentConfirmed !== true || s.ownerApproved !== true) stop('operation, logs or intent unverified');
  if (!['ativo','inativo'].includes(s.status) || !Number.isInteger(s.activeCount) || s.activeCount < 0 || !Number.isInteger(s.limit) || s.limit < -1) stop('invalid state');
  if (s.limit >= 0 && s.activeCount > s.limit) stop('capacity exceeded');
  if (typeof s.authDisabled !== 'boolean') stop('Auth state unknown');
  return {mode:'PLAN_ONLY',uid:s.uid,ownerUid:s.ownerUid,preconditions:{updateTime:s.updateTime,syncId:s.syncId},requiresSeparateAuthorization:true,authTargetDisabled:s.status!=='ativo',steps:['re-read guarded snapshot and confirm quiescence','authorize exact Auth repair if needed; revoke refresh tokens','verify Auth and capacity again','conditionally complete matching pending operation','verify positive/negative access and write intervention audit'],deleteIdentity:false};
}
