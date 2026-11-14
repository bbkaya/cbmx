import { useEffect, useRef } from "react";

export default function DeleteProcessDialog({ processName, pcbName, onClose }: {
  processName: string;
  pcbName: string;
  onClose: (confirmed: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} aria-labelledby="delete-process-title" aria-describedby="delete-process-message"
      onCancel={(event) => { event.preventDefault(); onClose(false); }}
      style={{ maxWidth: 520, border: "1px solid #cbd5e1", borderRadius: 10, padding: 24 }}>
      <h2 id="delete-process-title">Delete co-creation process?</h2>
      <div id="delete-process-message">
        <p>You are about to delete the co-creation process &quot;{processName}&quot;.</p>
        <p>This process is linked to the Process Canvas &quot;{pcbName}&quot;.</p>
        <p>Deleting this process will:</p>
        <ul>
          <li>Remove the co-creation process from the CBMX blueprint.</li>
          <li>Remove its association with the linked Process Canvas.</li>
          <li>Keep the Process Canvas and all its contents unchanged in the Process Canvas repository.</li>
        </ul>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" autoFocus onClick={() => onClose(false)}>Cancel</button>
        <button type="button" onClick={() => onClose(true)}>Delete process</button>
      </div>
    </dialog>
  );
}
