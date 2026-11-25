import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  LinearProgress,
} from '@mui/material';
import { Search, ExternalLink, FileSpreadsheet } from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { EvaluationReportSummary } from '../../api/types';
import { StatusBadge } from '../common/StatusBadge';

interface HistoricalReportsTableProps {
  reports: EvaluationReportSummary[];
  loading?: boolean;
}

export const HistoricalReportsTable: React.FC<HistoricalReportsTableProps> = ({
  reports,
  loading = false,
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.experiment_id.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'all' ||
        r.overall_status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [reports, search, statusFilter]);

  return (
    <Box>
      {/* Search and Filter Controls */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          mb: 3,
        }}
      >
        <TextField
          size="small"
          placeholder="Filter historical runs by ID or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} color={tokens.colors.textMuted} />
              </InputAdornment>
            ),
          }}
          sx={{
            flexGrow: 1,
            maxWidth: { xs: '100%', sm: 400 },
            '& .MuiOutlinedInput-root': {
              backgroundColor: tokens.colors.surfacePrimary,
              color: tokens.colors.textPrimary,
              fontSize: tokens.typography.fontSize.sm,
              '& fieldset': { borderColor: tokens.colors.border },
              '&:hover fieldset': { borderColor: tokens.colors.borderHover },
              '&.Mui-focused fieldset': { borderColor: tokens.colors.primary },
            },
          }}
        />

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ color: tokens.colors.textMuted, fontSize: tokens.typography.fontSize.sm }}>
            Status
          </InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{
              backgroundColor: tokens.colors.surfacePrimary,
              color: tokens.colors.textPrimary,
              fontSize: tokens.typography.fontSize.sm,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.colors.border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.colors.borderHover },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.colors.primary },
            }}
          >
            <MenuItem value="all">All Outcomes</MenuItem>
            <MenuItem value="pass">Pass Only</MenuItem>
            <MenuItem value="fail">Fail Only</MenuItem>
            <MenuItem value="error">Error Only</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Reports Table */}
      <TableContainer
        component={Paper}
        sx={{
          backgroundColor: tokens.colors.surfacePrimary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: `${tokens.borderRadius.md}px`,
          overflow: 'hidden',
        }}
      >
        {loading && <LinearProgress sx={{ backgroundColor: 'transparent' }} />}
        <Table>
          <TableHead sx={{ backgroundColor: tokens.colors.surfaceElevated }}>
            <TableRow>
              <TableCell sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                EXPERIMENT RUN ID
              </TableCell>
              <TableCell sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                TIMESTAMP
              </TableCell>
              <TableCell sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                STATUS
              </TableCell>
              <TableCell sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                SCENARIOS
              </TableCell>
              <TableCell sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                PASS RATE
              </TableCell>
              <TableCell sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                DURATION
              </TableCell>
              <TableCell align="right" sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                ACTIONS
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredReports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <FileSpreadsheet size={36} color={tokens.colors.textSubtle} />
                    <Typography sx={{ color: tokens.colors.textMuted, fontSize: tokens.typography.fontSize.sm }}>
                      {reports.length === 0
                        ? 'No historical evaluation reports found on disk in eval_reports.'
                        : 'No reports match the active filter criteria.'}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              filteredReports.map((report) => {
                const passRate = report.pass_rate_pct;
                const dateStr = report.timestamp
                  ? new Date(report.timestamp).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '--';

                return (
                  <TableRow
                    key={report.experiment_id}
                    hover
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: tokens.colors.surfaceSubtle },
                      borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
                    }}
                    onClick={() => navigate(`/evaluations/${report.experiment_id}`)}
                  >
                    <TableCell sx={{ py: 1.75 }}>
                      <Typography
                        component="span"
                        sx={{
                          fontFamily: tokens.typography.fontFamily.mono,
                          fontWeight: 600,
                          fontSize: tokens.typography.fontSize.sm,
                          color: tokens.colors.primaryLight,
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {report.experiment_id}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.75 }}>
                      <Typography sx={{ fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary }}>
                        {dateStr}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.75 }}>
                      <StatusBadge status={report.overall_status} size="small" />
                    </TableCell>
                    <TableCell sx={{ py: 1.75 }}>
                      <Typography sx={{ fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary }}>
                        <Box component="span" sx={{ color: tokens.colors.success, fontWeight: 600 }}>
                          {report.passed} passed
                        </Box>
                        {report.failed > 0 && (
                          <Box component="span" sx={{ color: tokens.colors.error, ml: 1, fontWeight: 600 }}>
                            {report.failed} failed
                          </Box>
                        )}
                        {report.errors > 0 && (
                          <Box component="span" sx={{ color: tokens.colors.warning, ml: 1, fontWeight: 600 }}>
                            {report.errors} err
                          </Box>
                        )}
                        <Box component="span" sx={{ color: tokens.colors.textSubtle, ml: 1 }}>
                          / {report.total_scenarios}
                        </Box>
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 1.75 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 120 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, Math.max(0, passRate))}
                          sx={{
                            flexGrow: 1,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor:
                                passRate === 100
                                  ? tokens.colors.success
                                  : passRate >= 80
                                  ? tokens.colors.warning
                                  : tokens.colors.error,
                            },
                          }}
                        />
                        <Typography
                          sx={{
                            fontFamily: tokens.typography.fontFamily.mono,
                            fontSize: tokens.typography.fontSize.xs,
                            fontWeight: 600,
                            color: passRate === 100 ? tokens.colors.success : tokens.colors.textPrimary,
                            minWidth: 44,
                          }}
                        >
                          {passRate.toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ py: 1.75 }}>
                      <Typography
                        sx={{
                          fontFamily: tokens.typography.fontFamily.mono,
                          fontSize: tokens.typography.fontSize.xs,
                          color: tokens.colors.textMuted,
                        }}
                      >
                        {(report.duration_ms / 1000).toFixed(2)}s
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 1.75 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<ExternalLink size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/evaluations/${report.experiment_id}`);
                        }}
                        sx={{
                          color: tokens.colors.primary,
                          borderColor: 'rgba(124, 140, 255, 0.3)',
                          textTransform: 'none',
                          fontSize: tokens.typography.fontSize.xs,
                          py: 0.25,
                          px: 1.25,
                          '&:hover': {
                            borderColor: tokens.colors.primary,
                            backgroundColor: 'rgba(124, 140, 255, 0.08)',
                          },
                        }}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
