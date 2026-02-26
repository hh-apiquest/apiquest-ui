// ResultsSummary - Display collection run results with expandable request details
import { useState } from 'react';
import { Badge } from '@radix-ui/themes';
import { ChevronDownIcon, ChevronRightIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface ResultsSummaryProps {
  results: {
    success: boolean;
    message?: string;
    error?: string;
    totalRequests: number;
    executed: number;
    passed: number;
    failed: number;
    duration: number;
    requests?: Array<{
      id: string;
      name: string;
      status: 'success' | 'failed';
      duration: number;
      tests?: Array<{
        name: string;
        passed: boolean;
        error?: string;
      }>;
    }>;
  };
}

export function ResultsSummary({ results }: ResultsSummaryProps) {
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());

  const toggleRequest = (requestId: string) => {
    const newExpanded = new Set(expandedRequests);
    if (newExpanded.has(requestId)) {
      newExpanded.delete(requestId);
    } else {
      newExpanded.add(requestId);
    }
    setExpandedRequests(newExpanded);
  };

  return (
    <div style={{
      border: '1px solid var(--gray-6)',
      borderRadius: '8px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Results</h3>
        <Badge color={results.success ? 'green' : 'red'} size="2">
          {results.success ? 'Success' : 'Failed'}
        </Badge>
      </div>

      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '12px',
        padding: '12px',
        backgroundColor: 'var(--gray-2)',
        borderRadius: '6px'
      }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--gray-10)', marginBottom: '4px' }}>Duration</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{(results.duration / 1000).toFixed(2)}s</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--gray-10)', marginBottom: '4px' }}>Requests</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{results.executed || 0} / {results.totalRequests}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--gray-10)', marginBottom: '4px' }}>Tests</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>
            <span style={{ color: 'var(--green-9)' }}>{results.passed || 0}</span>
            {' / '}
            <span style={{ color: 'var(--red-9)' }}>{results.failed || 0}</span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {results.error && (
        <div style={{
          padding: '12px',
          backgroundColor: 'var(--red-2)',
          border: '1px solid var(--red-6)',
          borderRadius: '6px',
          fontSize: '13px',
          color: 'var(--red-11)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Error</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{results.error}</div>
        </div>
      )}

      {/* Success Message (placeholder) */}
      {results.message && !results.error && (
        <div style={{
          padding: '12px',
          backgroundColor: 'var(--blue-2)',
          border: '1px solid var(--blue-6)',
          borderRadius: '6px',
          fontSize: '13px',
          color: 'var(--blue-11)'
        }}>
          {results.message}
        </div>
      )}

      {/* Request Details */}
      {results.requests && results.requests.length > 0 && (
        <div style={{ borderTop: '1px solid var(--gray-6)', paddingTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--gray-11)' }}>
            Request Details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {results.requests.map(request => {
              const isExpanded = expandedRequests.has(request.id);
              const hasTests = request.tests && request.tests.length > 0;
              
              return (
                <div key={request.id} style={{ border: '1px solid var(--gray-6)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    onClick={() => hasTests && toggleRequest(request.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      cursor: hasTests ? 'pointer' : 'default',
                      backgroundColor: isExpanded ? 'var(--gray-3)' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (hasTests) e.currentTarget.style.backgroundColor = 'var(--gray-3)';
                    }}
                    onMouseLeave={(e) => {
                      if (hasTests && !isExpanded) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {hasTests ? (
                      isExpanded ? (
                        <ChevronDownIcon className="w-4 h-4" style={{ color: 'var(--gray-10)' }} />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4" style={{ color: 'var(--gray-10)' }} />
                      )
                    ) : (
                      <span style={{ width: '16px' }} />
                    )}
                    
                    {request.status === 'success' ? (
                      <CheckCircleIcon className="w-4 h-4" style={{ color: 'var(--green-9)' }} />
                    ) : (
                      <XCircleIcon className="w-4 h-4" style={{ color: 'var(--red-9)' }} />
                    )}
                    
                    <span style={{ flex: 1, fontSize: '13px' }}>{request.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--gray-10)' }}>{request.duration}ms</span>
                    
                    {hasTests && request.tests && (
                      <Badge size="1" color={request.tests.every(t => t.passed) ? 'green' : 'red'}>
                        {request.tests.filter(t => t.passed).length}/{request.tests.length}
                      </Badge>
                    )}
                  </div>
                  
                  {isExpanded && hasTests && request.tests && (
                    <div style={{ borderTop: '1px solid var(--gray-6)', padding: '8px 12px 8px 44px', backgroundColor: 'var(--gray-2)' }}>
                      {request.tests.map((test, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', padding: '4px 0' }}>
                          {test.passed ? (
                            <CheckCircleIcon className="w-4 h-4" style={{ color: 'var(--green-9)', flexShrink: 0, marginTop: '2px' }} />
                          ) : (
                            <XCircleIcon className="w-4 h-4" style={{ color: 'var(--red-9)', flexShrink: 0, marginTop: '2px' }} />
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ color: test.passed ? 'var(--green-11)' : 'var(--red-11)' }}>
                              {test.name}
                            </div>
                            {test.error && (
                              <div style={{ fontSize: '11px', color: 'var(--red-10)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                                {test.error}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
