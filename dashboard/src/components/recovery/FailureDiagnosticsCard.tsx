import React, { useState } from 'react';
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
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Lightbulb,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { DiagnosticItem, DiagnosticSeverityLevel } from '../../api/recovery/types';

export interface FailureDiagnosticsCardProps {
  diagnostics: DiagnosticItem[];
}

export const FailureDiagnosticsCard: React.FC<FailureDiagnosticsCardProps> = ({
  diagnostics,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleCopyDetails = async (id: string, details: unknown) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      // ignore
    }
  };

  const filteredDiagnostics = diagnostics.filter((diag) => {
    if (filterSeverity !== 'all' && diag.severity !== filterSeverity) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const inCode = diag.code.toLowerCase().includes(q);
      const inMsg = diag.message.toLowerCase().includes(q);
      const inCat = diag.category.toLowerCase().includes(q);
      const inAction = (diag.suggested_action || '').toLowerCase().includes(q);
      const inTool = (diag.tool_call_id || '').toLowerCase().includes(q);
      return inCode || inMsg || inCat || inAction || inTool;
    }
    return true;
  });

  const getSeverityConfig = (severity: DiagnosticSeverityLevel) => {
    switch (severity) {
      case 'critical':
        return {
          color: tokens.colors.error,
          bg: 'rgba(241, 108, 120, 0.15)',
          border: '1px solid rgba(241, 108, 120, 0.4)',
          icon: <AlertOctagon size={16} color={tokens.colors.error} />,
          label: 'CRITICAL',
        };
      case 'error':
        return {
          color: tokens.colors.error,
          bg: tokens.colors.errorSubtle,
          border: '1px solid rgba(241, 108, 120, 0.25)',
          icon: <AlertCircle size={16} color={tokens.colors.error} />,
          label: 'ERROR',
        };
      case 'warning':
        return {
          color: tokens.colors.warning,
          bg: tokens.colors.warningSubtle,
          border: '1px solid rgba(240, 180, 90, 0.25)',
          icon: <AlertTriangle size={16} color={tokens.colors.warning} />,
          label: 'WARNING',
        };
      case 'info':
      default:
        return {
          color: tokens.colors.accentPrimary,
          bg: tokens.colors.primarySubtle,
          border: '1px solid rgba(124, 140, 255, 0.25)',
          icon: <Info size={16} color={tokens.colors.accentPrimary} />,
          label: 'INFO',
        };
    }
  };

  return (
    <Box>
      {/* Top Filter and Search Bar */}
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
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Button
            size="small"
            variant={filterSeverity === 'all' ? 'contained' : 'outlined'}
            onClick={() => setFilterSeverity('all')}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: filterSeverity === 'all' ? tokens.colors.primarySubtle : 'transparent',
              color: filterSeverity === 'all' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
            }}
          >
            All Diagnostics ({diagnostics.length})
          </Button>

          {(['critical', 'error', 'warning', 'info'] as DiagnosticSeverityLevel[]).map((sev) => {
            const count = diagnostics.filter((d) => d.severity === sev).length;
            if (count === 0) return null;
            const active = filterSeverity === sev;
            return (
              <Button
                key={sev}
                size="small"
                variant={active ? 'contained' : 'outlined'}
                onClick={() => setFilterSeverity(sev)}
                sx={{
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  borderRadius: `${tokens.borderRadius.sm}px`,
                  borderColor: tokens.colors.borderSubtle,
                  backgroundColor: active ? tokens.colors.surfaceElevated : 'transparent',
                  color: active ? tokens.colors.text.primary : tokens.colors.text.secondary,
                }}
              >
                {sev.toUpperCase()} ({count})
              </Button>
            );
          })}
        </Stack>

        <TextField
          size="small"
          placeholder="Filter diagnostics..."
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

      {/* Diagnostics List */}
      {diagnostics.length === 0 ? (
        <Box
          sx={{
            p: 4,
            textAlign: 'center',
            backgroundColor: tokens.colors.surfaceElevated,
            borderRadius: `${tokens.borderRadius.sm}px`,
            border: `1px dashed ${tokens.colors.borderSubtle}`,
          }}
        >
          <ShieldCheck size={32} color={tokens.colors.success} style={{ marginBottom: 8 }} />
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: tokens.colors.text.primary }}>
            No Diagnostic Anomalies Recorded
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.5 }}>
            Runtime execution has proceeded without policy denials, timeout violations, or recovery anomalies.
          </Typography>
        </Box>
      ) : filteredDiagnostics.length === 0 ? (
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
            No diagnostics match the selected severity or search filter.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {filteredDiagnostics.map((item) => {
            const isExpanded = expandedId === item.diagnostic_id;
            const isCopied = copiedId === item.diagnostic_id;
            const sevConfig = getSeverityConfig(item.severity);

            return (
              <Box
                key={item.diagnostic_id}
                sx={{
                  borderRadius: `${tokens.borderRadius.sm}px`,
                  backgroundColor: tokens.colors.surfaceElevated,
                  border: `1px solid ${
                    item.severity === 'critical'
                      ? 'rgba(241, 108, 120, 0.4)'
                      : item.severity === 'error'
                      ? 'rgba(241, 108, 120, 0.25)'
                      : tokens.colors.borderSubtle
                  }`,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                  '&:hover': {
                    borderColor:
                      item.severity === 'critical'
                        ? tokens.colors.error
                        : tokens.colors.borderHover,
                  },
                }}
              >
                {/* Header Row */}
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
                  onClick={() => toggleExpand(item.diagnostic_id)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: `${tokens.borderRadius.sm}px`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: sevConfig.bg,
                      }}
                    >
                      {sevConfig.icon}
                    </Box>

                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          label={item.code}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.6875rem',
                            fontFamily: tokens.typography.fontFamily.mono,
                            fontWeight: 700,
                            backgroundColor: 'rgba(146, 155, 172, 0.1)',
                            color: tokens.colors.text.primary,
                            borderRadius: '4px',
                          }}
                        />
                        <Chip
                          label={sevConfig.label}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            backgroundColor: sevConfig.bg,
                            color: sevConfig.color,
                            border: sevConfig.border,
                            borderRadius: '4px',
                          }}
                        />
                        <Chip
                          label={item.category.toUpperCase()}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.6875rem',
                            backgroundColor: 'transparent',
                            borderColor: tokens.colors.borderSubtle,
                            color: tokens.colors.text.muted,
                            borderRadius: '4px',
                          }}
                          variant="outlined"
                        />
                        {item.tool_call_id && (
                          <Chip
                            icon={<Wrench size={10} color={tokens.colors.accentPrimary} />}
                            label={item.tool_call_id}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.6875rem',
                              fontFamily: tokens.typography.fontFamily.mono,
                              backgroundColor: tokens.colors.primarySubtle,
                              color: tokens.colors.accentPrimary,
                              borderRadius: '4px',
                            }}
                          />
                        )}
                      </Box>

                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.text.primary, mt: 0.75 }}>
                        {item.message}
                      </Typography>
                    </Box>
                  </Box>

                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(item.diagnostic_id);
                    }}
                    sx={{ color: tokens.colors.text.muted }}
                    aria-label={isExpanded ? 'Collapse diagnostic details' : 'Expand diagnostic details'}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </IconButton>
                </Box>

                {/* Suggested Action Bar (Always visible if present) */}
                {item.suggested_action && (
                  <Box
                    sx={{
                      px: 2,
                      py: 1.25,
                      mx: 2,
                      mb: 2,
                      borderRadius: `${tokens.borderRadius.sm}px`,
                      backgroundColor: 'rgba(124, 140, 255, 0.05)',
                      borderLeft: `3px solid ${
                        item.severity === 'critical' || item.severity === 'error'
                          ? tokens.colors.error
                          : tokens.colors.accentPrimary
                      }`,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1.5,
                    }}
                  >
                    <Lightbulb size={16} color={tokens.colors.accentPrimary} style={{ marginTop: 2, flexShrink: 0 }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: tokens.colors.accentPrimary, textTransform: 'uppercase' }}>
                        Suggested Operator Action
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary, mt: 0.25 }}>
                        {item.suggested_action}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* Expandable Details Forensics */}
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
                        Diagnostic Forensics Payload
                      </Typography>
                      {item.details && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleCopyDetails(item.diagnostic_id, item.details)}
                          startIcon={isCopied ? <Check size={12} /> : <Copy size={12} />}
                          sx={{
                            fontSize: '0.6875rem',
                            textTransform: 'none',
                            height: 24,
                            borderColor: tokens.colors.borderSubtle,
                            color: tokens.colors.text.secondary,
                          }}
                        >
                          {isCopied ? 'Copied' : 'Copy Details'}
                        </Button>
                      )}
                    </Box>

                    {item.details ? (
                      <Box
                        component="pre"
                        sx={{
                          p: 1.5,
                          borderRadius: `${tokens.borderRadius.sm}px`,
                          backgroundColor: tokens.colors.surfaceElevated,
                          border: `1px solid ${tokens.colors.borderSubtle}`,
                          fontSize: '0.75rem',
                          fontFamily: tokens.typography.fontFamily.mono,
                          color: tokens.colors.text.secondary,
                          overflowX: 'auto',
                          m: 0,
                        }}
                      >
                        {JSON.stringify(item.details, null, 2)}
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                        No additional payload details attached.
                      </Typography>
                    )}
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
