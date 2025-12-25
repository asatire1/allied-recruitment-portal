import React from 'react'

export interface Column<T> {
  key: string
  header: string
  width?: string
  sortable?: boolean
  render?: (item: T, index: number) => React.ReactNode
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  loading?: boolean
  emptyState?: React.ReactNode
  onRowClick?: (item: T) => void
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (column: string) => void
  className?: string
  stickyHeader?: boolean
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  loading = false,
  emptyState,
  onRowClick,
  sortColumn,
  sortDirection,
  onSort,
  className = '',
  stickyHeader = false,
}: DataTableProps<T>) {
  const handleSort = (column: Column<T>) => {
    if (column.sortable && onSort) {
      onSort(column.key)
    }
  }

  const handleRowClick = (item: T) => {
    if (onRowClick) {
      onRowClick(item)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, item: T) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleRowClick(item)
    }
  }

  if (loading) {
    return (
      <div className={`data-table-wrapper ${className}`}>
        <table className="data-table">
          <thead className={stickyHeader ? 'sticky-header' : ''}>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={{ width: column.width }}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i} className="data-table-row-loading">
                {columns.map((column) => (
                  <td key={column.key}>
                    <div className="skeleton skeleton-text" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className={`data-table-wrapper ${className}`}>
        <table className="data-table">
          <thead className={stickyHeader ? 'sticky-header' : ''}>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={{ width: column.width }}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="data-table-empty">
          {emptyState || <p>No data available</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={`data-table-wrapper ${className}`}>
      <table className="data-table">
        <thead className={stickyHeader ? 'sticky-header' : ''}>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ width: column.width }}
                className={column.sortable ? 'sortable' : ''}
                onClick={() => handleSort(column)}
                role={column.sortable ? 'button' : undefined}
                tabIndex={column.sortable ? 0 : undefined}
                onKeyDown={(e) => {
                  if (column.sortable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    handleSort(column)
                  }
                }}
                aria-sort={
                  sortColumn === column.key
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
              >
                <span className="th-content">
                  {column.header}
                  {column.sortable && (
                    <span className="sort-icon">
                      {sortColumn === column.key ? (
                        sortDirection === 'asc' ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M6 2L10 7H2L6 2Z" fill="currentColor"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M6 10L2 5H10L6 10Z" fill="currentColor"/>
                          </svg>
                        )
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" opacity="0.3">
                          <path d="M6 2L10 5H2L6 2Z" fill="currentColor"/>
                          <path d="M6 10L2 7H10L6 10Z" fill="currentColor"/>
                        </svg>
                      )}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr
              key={String(item[keyField])}
              className={onRowClick ? 'clickable' : ''}
              onClick={() => handleRowClick(item)}
              onKeyDown={(e) => handleKeyDown(e, item)}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
            >
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render
                    ? column.render(item, index)
                    : String(item[column.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
