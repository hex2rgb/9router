"use client";

import { useState } from "react";
import { Button } from "@/shared/components";

export default function TestAllAndCleanButton({
  allModels,
  providerStorageAlias,
  onDeleteCustomModel,
  onDeleteAlias,
  onTestResult,
}) {
  const [testingAll, setTestingAll] = useState(false);
  const [testProgress, setTestProgress] = useState("");

  const handleTestAllAndClean = async () => {
    if (testingAll || allModels.length === 0) return;

    setTestingAll(true);
    let tested = 0;
    let deleted = 0;

    for (const { id, alias, source } of allModels) {
      tested++;
      setTestProgress(`${tested}/${allModels.length}`);
      try {
        const res = await fetch("/api/models/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: `${providerStorageAlias}/${id}` }),
        });
        const data = await res.json();
        onTestResult?.(id, data.ok ? "ok" : "error");
        if (!data.ok) {
          if (source === "custom") {
            await onDeleteCustomModel(id);
          } else {
            onDeleteAlias?.(alias);
          }
          deleted++;
        }
      } catch {
        onTestResult?.(id, "error");
        if (source === "custom") {
          await onDeleteCustomModel(id);
        } else {
          onDeleteAlias?.(alias);
        }
        deleted++;
      }
    }

    setTestingAll(false);
    setTestProgress("");

    if (deleted > 0) {
      alert(`Tested ${allModels.length} models. ${deleted} failed and were removed.`);
    } else {
      alert(`All ${allModels.length} models passed.`);
    }
  };

  return (
    <Button
      size="sm"
      variant="secondary"
      icon="play_arrow"
      onClick={handleTestAllAndClean}
      disabled={testingAll}
    >
      {testingAll ? `Testing (${testProgress})...` : "Test All & Clean"}
    </Button>
  );
}
