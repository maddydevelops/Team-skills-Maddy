import React from "react";
import {
  Pagination,
  PaginationLink,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "../ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const CustomPagination = ({
  page,
  setPage,
  totalPages,
  rowsPerPage,
  setRowsPerPage,
  count,
  paginationOptioins,
}: {
  page: number;
  setPage: (page: any) => void;
  totalPages: number;
  rowsPerPage: any;
  setRowsPerPage: (rowsPerPage: any) => void;
  count: any;
  paginationOptioins: string[];
}) => {
  return (
    <div className="flex items-center justify-between mt-4">
      <div className="text-sm text-gray-500">
        Showing {(page - 1) * Number(rowsPerPage) + 1} to{" "}
        {Math.min(page * Number(rowsPerPage), count)} of {count} records
      </div>
      <Pagination className="w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => setPage(Math.max(1, page - 1))}
              className={page <= 1 ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
          {(() => {
            const renderPageNumbers = () => {
              const pages = [];
              const maxVisiblePages = 5;
              if (totalPages <= maxVisiblePages + 2) {
                for (let i = 1; i <= totalPages; i++) {
                  pages.push(
                    <PaginationItem key={i}>
                      <PaginationLink
                        onClick={() => setPage(i)}
                        isActive={page === i}
                      >
                        {i}
                      </PaginationLink>
                    </PaginationItem>
                  );
                }
              } else {
                pages.push(
                  <PaginationItem key={1}>
                    <PaginationLink
                      onClick={() => setPage(1)}
                      isActive={page === 1}
                    >
                      1
                    </PaginationLink>
                  </PaginationItem>
                );
                let startPage = Math.max(2, page - 1);
                let endPage = Math.min(totalPages - 1, page + 1);
                if (page <= 3) {
                  endPage = Math.min(totalPages - 1, 4);
                }
                if (page >= totalPages - 2) {
                  startPage = Math.max(2, totalPages - 3);
                }
                if (startPage > 2) {
                  pages.push(
                    <PaginationItem key="ellipsis-start">
                      <span className="px-3 py-2 text-sm text-gray-500">
                        ...
                      </span>
                    </PaginationItem>
                  );
                }
                for (let i = startPage; i <= endPage; i++) {
                  pages.push(
                    <PaginationItem key={i}>
                      <PaginationLink
                        onClick={() => setPage(i)}
                        isActive={page === i}
                      >
                        {i}
                      </PaginationLink>
                    </PaginationItem>
                  );
                }
                if (endPage < totalPages - 1) {
                  pages.push(
                    <PaginationItem key="ellipsis-end">
                      <span className="px-3 py-2 text-sm text-gray-500">
                        ...
                      </span>
                    </PaginationItem>
                  );
                }
                if (totalPages > 1) {
                  pages.push(
                    <PaginationItem key={totalPages}>
                      <PaginationLink
                        onClick={() => setPage(totalPages)}
                        isActive={page === totalPages}
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  );
                }
              }
              return pages;
            };
            return renderPageNumbers();
          })()}
          <PaginationItem>
            <PaginationNext
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              className={
                page >= totalPages || page * Number(rowsPerPage) >= count
                  ? "pointer-events-none opacity-50"
                  : ""
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Rows per page:</span>
        <Select
          value={rowsPerPage}
          onValueChange={(value) => {
            setRowsPerPage(value);
          }}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue placeholder="10" />
          </SelectTrigger>
          <SelectContent>
            {paginationOptioins.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
export default CustomPagination;
