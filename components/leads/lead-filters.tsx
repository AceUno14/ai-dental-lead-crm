import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { LEAD_STATUS_LABELS } from "@/lib/lead-labels";

const STATUS_OPTIONS = Object.entries(LEAD_STATUS_LABELS);
const PRIORITY_OPTIONS = ["HOT", "WARM", "COLD"];

/**
 * Archived leads are reachable only through this filter, so they never clutter
 * the working queue — but they are never hidden from staff either.
 */
const ARCHIVE_OPTIONS = [
  { value: "", label: "Active leads" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All leads" },
];

export function LeadFilters({
  status = "",
  priority = "",
  search = "",
  archived = "",
}: {
  status?: string;
  priority?: string;
  search?: string;
  archived?: string;
}) {
  return (
    <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="sm:w-40">
        <Label htmlFor="filter-status">Status</Label>
        <Select id="filter-status" name="status" defaultValue={status} className="mt-1.5">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div className="sm:w-36">
        <Label htmlFor="filter-priority">Priority</Label>
        <Select id="filter-priority" name="priority" defaultValue={priority} className="mt-1.5">
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>

      <div className="sm:w-36">
        <Label htmlFor="filter-archived">View</Label>
        <Select id="filter-archived" name="archived" defaultValue={archived} className="mt-1.5">
          {ARCHIVE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex-1">
        <Label htmlFor="filter-search">Search</Label>
        <Input
          id="filter-search"
          name="search"
          type="search"
          defaultValue={search}
          placeholder="Name, email or phone"
          className="mt-1.5"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit">Apply filters</Button>
        <Link
          href="/leads"
          className="inline-flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}
