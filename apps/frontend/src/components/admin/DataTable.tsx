import { Children, cloneElement, isValidElement, type ReactNode } from 'react';

type TableElementProps = {
  children?: ReactNode;
  'data-label'?: string;
};

export function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  const rows = Children.map(children, (row) => {
    if (!isValidElement<TableElementProps>(row)) return row;
    let cellIndex = 0;
    const cells = Children.map(row.props.children, (cell) => {
      if (!isValidElement<TableElementProps>(cell)) return cell;
      const label = headers[cellIndex] || '';
      cellIndex += 1;
      return cloneElement(cell, { 'data-label': label });
    });
    return cloneElement(row, { children: cells });
  });

  return <div className="responsive-data-table h-[calc(100vh-15rem)] min-h-[18rem] w-full min-w-0 overflow-x-auto overflow-y-auto rounded-xl border border-white/10"><table className="w-full min-w-[640px] table-fixed text-left text-sm"><thead className="sticky top-0 z-10 bg-[#11141d] text-xs uppercase tracking-wider text-slate-500"><tr>{headers.map((header) => <th key={header} className="break-words px-3 py-3 font-semibold sm:px-4">{header}</th>)}</tr></thead><tbody className="divide-y divide-white/5 [&_td]:break-words [&_td]:align-top">{rows}</tbody></table></div>;
}
