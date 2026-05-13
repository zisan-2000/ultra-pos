// app/dashboard/sales/components/pos-serial-picker-modal.tsx

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { usePosSerials } from "../hooks/use-pos-serials";

type PosSerialHook = ReturnType<typeof usePosSerials>;

type Props = Pick<
  PosSerialHook,
  | "serialPicker"
  | "setSerialPicker"
  | "availableSerials"
  | "serialStockQty"
  | "serialInStockCount"
  | "serialHasMismatch"
  | "serialBlockingReason"
  | "serialPickerInput"
  | "setSerialPickerInput"
  | "selectedSerials"
  | "setSelectedSerials"
  | "serialsLoading"
  | "serialTargetQty"
  | "confirmSerialPicker"
  | "addManualSerial"
>;

export function PosSerialPickerModal({
  serialPicker,
  setSerialPicker,
  availableSerials,
  serialStockQty,
  serialInStockCount,
  serialHasMismatch,
  serialBlockingReason,
  serialPickerInput,
  setSerialPickerInput,
  selectedSerials,
  setSelectedSerials,
  serialsLoading,
  serialTargetQty,
  confirmSerialPicker,
  addManualSerial,
}: Props) {
  return (
    <Dialog
      open={!!serialPicker}
      onOpenChange={(open) => {
        if (!open) setSerialPicker(null);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Serial Number দিন</DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">
              {serialPicker?.productName}
            </span>{" "}
            — {serialPicker?.qty}টি unit এর serial number লিখুন বা নির্বাচন করুন
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            className={`text-center text-sm font-semibold rounded-lg py-1.5 ${
              !serialHasMismatch && selectedSerials.length === serialTargetQty
                ? "bg-green-50 text-green-700"
                : "bg-orange-50 text-orange-700"
            }`}
          >
            {selectedSerials.length} / {serialTargetQty} serial নির্বাচিত
          </div>

          {serialBlockingReason ? (
            <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
              {serialBlockingReason}
            </div>
          ) : null}

          {/* Manual input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={serialPickerInput}
              onChange={(e) => setSerialPickerInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addManualSerial(serialPickerInput);
                }
              }}
              placeholder="Serial scan বা type করুন, Enter চাপুন"
              className="flex-1 h-10 rounded-lg border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => addManualSerial(serialPickerInput)}
              className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
            >
              যোগ
            </button>
          </div>

          {/* Selected serials chips */}
          {selectedSerials.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedSerials.map((sn) => (
                <span
                  key={sn}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5"
                >
                  {sn}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedSerials((prev) => prev.filter((s) => s !== sn))
                    }
                    className="text-blue-500 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Available IN_STOCK serials */}
          {serialsLoading ? (
            <p className="text-xs text-muted-foreground text-center py-2">লোড হচ্ছে...</p>
          ) : availableSerials.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">
                স্টকে থাকা serial ({availableSerials.length}টি):
              </p>
              {serialHasMismatch ? (
                <p className="text-[11px] text-warning">
                  স্টক mismatch: stock {serialStockQty ?? "?"}, IN_STOCK serial{" "}
                  {serialInStockCount ?? availableSerials.length}
                </p>
              ) : null}
              <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1">
                {availableSerials.map((s) => {
                  const selected = selectedSerials.includes(s.serialNo);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (selected) {
                          setSelectedSerials((prev) =>
                            prev.filter((x) => x !== s.serialNo)
                          );
                        } else {
                          setSelectedSerials((prev) => [...prev, s.serialNo]);
                        }
                      }}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        selected
                          ? "bg-blue-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-blue-50 hover:text-blue-700 border border-border"
                      }`}
                    >
                      {s.serialNo}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-1">
              {serialBlockingReason
                ? "Mismatch থাকায় serial list দেখানো হয়নি। আগে reconcile করুন।"
                : "স্টকে কোনো registered serial নেই — manually type করুন"}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => setSerialPicker(null)}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            এড়িয়ে যান
          </button>
          <button
            type="button"
            onClick={confirmSerialPicker}
            disabled={
              serialHasMismatch ||
              selectedSerials.length !== serialTargetQty
            }
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            নিশ্চিত করুন
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
