import React, { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { PolicyDecisionItem } from '../../api/governance/types';
import { sanitizePayload } from '../..//api/sse/normalizer';
import { tokens } from '../../theme/tokens';

interface PolicyInspectorProps {
  decisions: PolicyDecisionItem[];
}

export const PolicyInspector: React.FC<PolicyInspectorProps> = ({ decisions }) => {
  const [filterType, setFilterType] = useState<'all' | 'allowed' | 'denied'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const allowedCount = useMemo(() => decisions.filter((d) => d.allowed).length, [decisions]);
  const deniedCount = useMemo(() => decisions.filter((d) => !d.allowed).length, [decisions]);

  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      if (filterType === 'allowed' && !d.allowed) return false;
      if (filterType === 'denied' && d.allowed) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTool = d.toolName.toLowerCase().includes(query);
        const matchesRule = d.matchedRule.toLowerCase().includes(query);
        const matchesReason = d.reason.toLowerCase().includes(query);
        const matchesCallId = d.callId?.toLowerCase().includes(query);
        if (!matchesTool && !matchesRule && !matchesReason && !matchesCallId) {
          return false;
        }
      }
      return true;
    });
  }, [decisions, filterType, searchQuery]);

  const handleCopyPayload = async (id: string, payload: unknown) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <Box>
      {/* Filter and Search Bar */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 2,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant={filterType === 'all' ? 'contained' : 'outlined'}
            onClick={() => setFilterType('all')}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: filterType === 'all' ? tokens.colors.primarySubtle : 'transparent',
              color: filterType === 'all' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
            }}
          >
            All Decisions ({decisions.length})
          </Button>
          <Button
            size="small"
            variant={filterType === 'allowed' ? 'contained' : 'outlined'}
            onClick={() => setFilterType('allowed')}
            startIcon={<ShieldCheck size={14} color={tokens.colors.success} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: filterType === 'allowed' ? tokens.colors.successSubtle : 'transparent',
              color: filterType === 'allowed' ? tokens.colors.success : tokens.colors.text.secondary,
            }}
          >
            Allowed ({allowedCount})
          </Button>
          <Button
            size="small"
            variant={filterType === 'denied' ? 'contained' : 'outlined'}
            onClick={() => setFilterType('denied')}
            startIcon={<ShieldAlert size={14} color={tokens.colors.error} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: filterType === 'denied' ? tokens.colors.errorSubtle : 'transparent',
              color: filterType === 'denied' ? tokens.colors.error : tokens.colors.text.secondary,
            }}
          >
            Denied ({deniedCount})
          </Button>
        </Stack>

        <TextField
          size="small"
          placeholder="Filter decisions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={14} color={tokens.colors.text.muted} />
              </InputAdornment>
            ),
          }}
          sx={{
            width: { xs: '100%', sm: 240 },
            '& .MuiInputBase-root': {
              fontSize: '0.75rem',
              height: 32,
              backgroundColor: tokens.colors.surfaceElevated,
              borderColor: tokens.colors.borderSubtle,
            },
          }}
        />
      </Box>

      {/* Decision Ledger List */}
      {decisions.length === 0 ? (
        <Box
          sx={{
            p: 4,
            textAlign: 'center',
            backgroundColor: tokens.colors.surfaceElevated,
            borderRadius: `${tokens.borderRadius.sm}px`,
            border: `1px dashed ${tokens.colors.borderSubtle}`,
          }}
        >
          <Shield size={32} color={tokens.colors.text.disabled} style={{ marginBottom: 8 }} />
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: tokens.colors.text.secondary }}>
            No Policy Decisions Recorded
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.5 }}>
            No authorization evaluations have been dispatched for this task yet.
          </Typography>
        </Box>
      ) : filteredDecisions.length === 0 ? (
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            backgroundColor: tokens.colors.surfaceElevated,
            borderRadius: `${tokens.borderRadius.sm}px`,
            border: `1px solid ${tokens.colors.borderSubtle}`,
          }}
        >
          <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
            No policy decisions match the selected filter or search query.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {filteredDecisions.map((decision) => {
            const isExpanded = expandedId === decision.id;
            const isCopied = copiedId === decision.id;

            return (
              <Box
                key={decision.id}
                sx={{
                  borderRadius: `${tokens.borderRadius.sm}px`,
                  backgroundColor: tokens.colors.surfaceElevated,
                  border: `1px solid ${
                    decision.allowed ? tokens.colors.borderSubtle : 'rgba(241, 108, 120, 0.3)'
                  }`,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                  '&:hover': {
                    borderColor: decision.allowed ? tokens.colors.borderHover : tokens.colors.error,
                  },
                }}
              >
                {/* Main Decision Header */}
                <Box
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleExpand(decision.id)}
                >
                  {/* Left: Status icon, Tool name, Decision badge */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: `${tokens.borderRadius.sm}px`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: decision.allowed ? tokens.colors.successSubtle : tokens.colors.errorSubtle,
                      }}
                    >
                      {decision.allowed ? (
                        <ShieldCheck size={18} color={tokens.colors.success} />
                      ) : (
                        <ShieldAlert size={18} color={tokens.colors.error} />
                      )}
                    </Box>

                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          sx={{
                            fontFamily: tokens.typography.fontFamily.mono,
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: tokens.colors.text.primary,
                          }}
                        >
                          {decision.toolName}
                        </Typography>

                        <Chip
                          label={decision.allowed ? 'ALLOWED' : 'DENIED'}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            backgroundColor: decision.allowed ? tokens.colors.successSubtle : tokens.colors.errorSubtle,
                            color: decision.allowed ? tokens.colors.success : tokens.colors.error,
                            border: `1px solid ${
                              decision.allowed ? 'rgba(53, 201, 138, 0.3)' : 'rgba(241, 108, 120, 0.3)'
                            }`,
                          }}
                        />

                        {decision.step !== undefined && (
                          <Typography
                            sx={{
                              fontSize: '0.6875rem',
                              fontFamily: tokens.typography.fontFamily.mono,
                              color: tokens.colors.text.muted,
                            }}
                          >
                            [Step {decision.step}]
                          </Typography>
                        )}
                      </Box>

                      {/* Rule & Reason */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          label={`Rule: ${decision.matchedRule}`}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.625rem',
                            fontFamily: tokens.typography.fontFamily.mono,
                            backgroundColor: 'rgba(124, 140, 255, 0.08)',
                            color: tokens.colors.primaryLight,
                            borderRadius: '4px',
                          }}
                        />
                        <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary }}>
                          {decision.reason}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Right: Execution correlation status and toggle */}
                  <Stack direction="row" spacing={1} alignItems="center">
                    {/* Execution correlation badge */}
                    {decision.executionStatus === 'rejected' ? (
                      <Chip
                        label="Execution Blocked by Engine"
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6875rem',
                          backgroundColor: 'rgba(241, 108, 120, 0.1)',
                          color: tokens.colors.error,
                          border: `1px solid rgba(241, 108, 120, 0.25)`,
                        }}
                      />
                    ) : decision.executionStatus === 'success' ? (
                      <Chip
                        label={`Executed: Success${
                          decision.executionDuration !== undefined ? ` (${decision.executionDuration.toFixed(2)}s)` : ''
                        }`}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6875rem',
                          backgroundColor: tokens.colors.successSubtle,
                          color: tokens.colors.success,
                          border: `1px solid rgba(53, 201, 138, 0.25)`,
                        }}
                      />
                    ) : decision.executionStatus === 'failure' ? (
                      <Chip
                        label="Executed: Failed"
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6875rem',
                          backgroundColor: tokens.colors.errorSubtle,
                          color: tokens.colors.error,
                        }}
                      />
                    ) : decision.executionStatus === 'timeout' ? (
                      <Chip
                        label="Executed: Timed Out"
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6875rem',
                          backgroundColor: tokens.colors.warningSubtle,
                          color: tokens.colors.warning,
                        }}
                      />
                    ) : decision.executionStatus === 'running' ? (
                      <Chip
                        label="Executed: Running"
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6875rem',
                          backgroundColor: tokens.colors.primarySubtle,
                          color: tokens.colors.accentPrimary,
                        }}
                      />
                    ) : (
                      <Chip
                        label="Authorized (Awaiting Execution)"
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6875rem',
                          backgroundColor: 'rgba(146, 155, 172, 0.1)',
                          color: tokens.colors.text.muted,
                        }}
                      />
                    )}

                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(decision.id);
                      }}
                      sx={{ color: tokens.colors.text.muted }}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </IconButton>
                  </Stack>
                </Box>

                {/* Expandable Decision Forensics */}
                <Collapse in={isExpanded} unmountOnExit>
                  <Box
                    sx={{
                      p: 2,
                      backgroundColor: tokens.colors.surfaceSubtle,
                      borderTop: `1px solid ${tokens.colors.borderSubtle}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: tokens.colors.text.muted, textTransform: 'uppercase' }}>
                        Policy Decision Forensics & Correlated Evidence
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleCopyPayload(decision.id, decision.payload)}
                        startIcon={isCopied ? <Check size={12} /> : <Copy size={12} />}
                        sx={{
                          fontSize: '0.6875rem',
                          textTransform: 'none',
                          height: 24,
                          borderColor: tokens.colors.borderSubtle,
                          color: tokens.colors.text.secondary,
                        }}
                      >
                        {isCopied ? 'Copied' : 'Copy Payload'}
                      </Button>
                    </Box>

                    {decision.callId && (
                      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                          Call ID:
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontFamily: tokens.typography.fontFamily.mono,
                            color: tokens.colors.primaryLight,
                          }}
                        >
                          {decision.callId}
                        </Typography>
                      </Box>
                    )}

                    {decision.timestamp && (
                      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                          Timestamp:
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontFamily: tokens.typography.fontFamily.mono,
                            color: tokens.colors.text.secondary,
                          }}
                        >
                          {decision.timestamp}
                        </Typography>
                      </Box>
                    )}

                    {/* Formatted JSON Payload Block */}
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1.5,
                        borderRadius: `${tokens.borderRadius.sm}px`,
                        backgroundColor: tokens.colors.backgroundRoot,
                        border: `1px solid ${tokens.colors.borderSubtle}`,
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontSize: '0.75rem',
                        color: tokens.colors.text.secondary,
                        overflowX: 'auto',
                        maxHeight: 200,
                      }}
                    >
                      {JSON.stringify(sanitizePayload(decision.payload), null, 2)}
                    </Box>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};
