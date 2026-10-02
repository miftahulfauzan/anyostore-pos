function isExpectedRequestAbort(error, signal) {
  if (signal?.aborted) return true;

  const errors = [error, error?.cause].filter(Boolean);
  return errors.some((candidate) => (
    candidate.name === 'AbortError'
    || candidate.name === 'CanceledError'
    || /\bsignal is aborted without reason\b/i.test(String(candidate.message || ''))
  ));
}

module.exports = { isExpectedRequestAbort };
