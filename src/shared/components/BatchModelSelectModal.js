"use client";

import { useState, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "./Modal";
import ProviderIcon from "./ProviderIcon";
import CapacityBadges from "./CapacityBadges";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import {
  OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS,
  isOpenAICompatibleProvider, isAnthropicCompatibleProvider,
  getProviderAlias,
} from "@/shared/constants/providers";

const TAB_CONFIG = [
  { key: "all", label: "All" },
  { key: "oauth", label: "OAuth" },
  { key: "free", label: "Free" },
  { key: "apikey", label: "API Key" },
  { key: "compatible", label: "Compatible" },
];

function isCustomCompatibleProvider(providerId) {
  return isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);
}

export default function BatchModelSelectModal({
  onAdd,
  addedModelValues = [],
  activeProviders = [],
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("compatible");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModels, setSelectedModels] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [modelAliases, setModelAliases] = useState({});
  const [customModels, setCustomModels] = useState([]);
  const [disabledModels, setDisabledModels] = useState({});
  const [providerNodes, setProviderNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const { getCaps } = useModelCaps();

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedModels(new Set(addedModelValues));
    setSearchQuery("");
    setCollapsedGroups(new Set());
    setActiveTab("compatible");
    setLoading(true);
    setDataReady(false);

    Promise.all([
      fetch("/api/models/alias").catch(() => ({ ok: false })),
      fetch("/api/models/custom").catch(() => ({ ok: false })),
      fetch("/api/models/disabled").catch(() => ({ ok: false })),
      fetch("/api/provider-nodes").catch(() => ({ ok: false })),
    ]).then(([aliasRes, customRes, disabledRes, nodesRes]) => {
      if (aliasRes.ok) aliasRes.json().then((d) => setModelAliases(d.aliases || {}));
      if (customRes.ok) customRes.json().then((d) => setCustomModels(d.models || []));
      if (disabledRes.ok) disabledRes.json().then((d) => setDisabledModels(d.disabled || {}));
      if (nodesRes.ok) nodesRes.json().then((d) => setProviderNodes(d.nodes || []));
      setLoading(false);
      setDataReady(true);
    }).catch(() => {
      setLoading(false);
      setDataReady(true);
    });
  }, [isOpen, addedModelValues]);

  const allProviders = useMemo(
    () => ({ ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...APIKEY_PROVIDERS, ...WEB_COOKIE_PROVIDERS }),
    [],
  );

  // Build providerId -> which category it belongs to
  const providerCategory = useMemo(() => {
    const cat = {};
    for (const id of Object.keys(OAUTH_PROVIDERS)) cat[id] = "oauth";
    for (const id of Object.keys(FREE_PROVIDERS)) cat[id] = "free";
    for (const id of Object.keys(FREE_TIER_PROVIDERS)) cat[id] = "free";
    for (const id of Object.keys(APIKEY_PROVIDERS)) cat[id] = "apikey";
    for (const id of Object.keys(WEB_COOKIE_PROVIDERS)) cat[id] = "apikey";
    return cat;
  }, []);

  // Get active provider IDs
  const activeConnectionIds = useMemo(
    () => new Set(activeProviders.map((p) => p.provider)),
    [activeProviders],
  );

  // No-auth providers (always show)
  const noAuthIds = useMemo(
    () => Object.entries(FREE_PROVIDERS).filter(([, v]) => v.noAuth).map(([id]) => id),
    [],
  );

  // Provider IDs to show (connected + noAuth)
  const providerIdsToShow = useMemo(() => {
    const ids = new Set([...activeConnectionIds, ...noAuthIds]);
    // Filter by category tab
    const result = [...ids].filter((id) => {
      if (activeTab === "all") return true;
      if (activeTab === "compatible") return isCustomCompatibleProvider(id);
      if (activeTab === "oauth") return providerCategory[id] === "oauth";
      if (activeTab === "free") return providerCategory[id] === "free";
      if (activeTab === "apikey") return providerCategory[id] === "apikey";
      return true;
    });
    return result;
  }, [activeConnectionIds, noAuthIds, activeTab, providerCategory]);

  // Build grouped models
  const groupedModels = useMemo(() => {
    if (!dataReady) return {};
    const groups = {};
    const typedKinds = new Set(["image", "tts", "stt", "embedding", "imageToText"]);

    // Build prefix lookup for compatible providers from providerNodes
    const prefixByProviderId = {};
    providerNodes.forEach((node) => {
      prefixByProviderId[node.id] = node.prefix;
    });

    providerIdsToShow.forEach((providerId) => {
      const alias = getProviderAlias(providerId);
      const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
      const isCustom = isCustomCompatibleProvider(providerId);
      const isPassthrough = isCustom || providerInfo.passthroughModels;
      // Compatible providers use the node's prefix, not the alias
      const modelPrefix = isCustom && prefixByProviderId[providerId] ? prefixByProviderId[providerId] : alias;
      let models = [];

      if (isCustom) {
        // Compatible providers: models from aliases (value uses prefix not alias)
        const nodeModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${providerId}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${providerId}/`, ""),
            name: aliasName,
            value: `${modelPrefix}/${fullModel.replace(`${providerId}/`, "")}`,
          }));
        models = nodeModels.length > 0 ? nodeModels : [];
      } else if (isPassthrough) {
        // Passthrough providers: aliases + hardcoded (no custom models)
        const aliasModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${alias}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${alias}/`, ""),
            name: aliasName,
            value: fullModel,
          }));
        const hardcodedModels = getModelsByProviderId(providerId)
          .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")
          .map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) }));
        const seen = new Set();
        const merged = [...aliasModels, ...hardcodedModels];
        models = merged.filter((m) => {
          if (seen.has(m.value)) return false;
          seen.add(m.value);
          return true;
        });
      } else {
        // Standard providers
        const hardcodedModels = getModelsByProviderId(providerId)
          .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")
          .map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) }));
        const seen = new Set();
        models = hardcodedModels.filter((m) => {
          if (seen.has(m.value)) return false;
          seen.add(m.value);
          return true;
        });
      }

      if (models.length === 0) return;

      // Filter out disabled models
      const disabledIds = new Set([
        ...(disabledModels[alias] || []),
        ...(disabledModels[providerId] || []),
      ]);
      if (disabledIds.size > 0) {
        models = models.filter((m) => !disabledIds.has(m.id));
        if (models.length === 0) return;
      }

      const matchedNode = activeProviders.find((p) => p.provider === providerId);
      const displayName = matchedNode?.name || providerInfo.name;
      const nodePrefix = matchedNode?.providerSpecificData?.prefix || (isCustom ? modelPrefix : alias);

      groups[providerId] = {
        name: displayName,
        alias: nodePrefix,
        color: providerInfo.color,
        models,
        isCustom,
      };
    });

    // Custom Models: separate group at the end, not merged into providers
    if (customModels.length > 0) {
      // Build node-id -> prefix lookup so we use the prefix (e.g. "test") instead of the raw providerAlias (node id)
      const prefixByNodeId = {};
      providerNodes.forEach((node) => {
        prefixByNodeId[node.id] = node.prefix;
      });

      const customModelItems = customModels
        .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")
        .map((m) => {
          const nodePrefix = prefixByNodeId[m.providerAlias];
          return {
            id: m.id,
            name: m.name || m.id,
            value: `${nodePrefix || m.providerAlias}/${m.id}`,
            isCustom: true,
            kind: getModelKind(m),
          };
        });
      if (customModelItems.length > 0) {
        groups["__custom_models"] = {
          name: "Custom Models",
          alias: "",
          color: "#888",
          models: customModelItems,
          isCustom: false,
          isCustomModels: true,
        };
      }
    }

    return groups;
  }, [providerIdsToShow, allProviders, modelAliases, customModels, disabledModels, dataReady, activeProviders, providerNodes]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = {};
    Object.entries(groupedModels).forEach(([providerId, group]) => {
      let models = group.models;
      if (query) {
        const providerNameMatches = group.name.toLowerCase().includes(query);
        models = models.filter(
          (m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query),
        );
        if (models.length === 0 && !providerNameMatches) return;
      }
      filtered[providerId] = { ...group, models };
    });
    return filtered;
  }, [groupedModels, searchQuery]);

  // Compute counts per tab
  const tabCounts = useMemo(() => {
    if (!dataReady) return {};
    const counts = { all: 0, oauth: 0, free: 0, apikey: 0, compatible: 0 };
    Object.entries(groupedModels).forEach(([providerId, group]) => {
      // Custom models only count toward "all"
      if (providerId === "__custom_models") {
        counts.all += group.models.length;
        return;
      }
      const cat = isCustomCompatibleProvider(providerId)
        ? "compatible"
        : (providerCategory[providerId] || "apikey");
      counts[cat] += group.models.length;
      counts.all += group.models.length;
    });
    return counts;
  }, [groupedModels, providerCategory, dataReady]);

  const visibleProviderIds = Object.keys(filteredGroups);
  const totalVisibleModels = visibleProviderIds.reduce(
    (sum, id) => sum + filteredGroups[id].models.length, 0,
  );

  // Select All for current view
  const allVisibleValues = useMemo(() => {
    const values = new Set();
    Object.values(filteredGroups).forEach((group) => {
      group.models.forEach((m) => values.add(m.value));
    });
    return values;
  }, [filteredGroups]);

  const allVisibleSelected = [...allVisibleValues].every((v) => selectedModels.has(v));

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      const next = new Set(selectedModels);
      allVisibleValues.forEach((v) => next.delete(v));
      setSelectedModels(next);
    } else {
      const next = new Set(selectedModels);
      allVisibleValues.forEach((v) => next.add(v));
      setSelectedModels(next);
    }
  };

  const handleToggleModel = (value) => {
    const next = new Set(selectedModels);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSelectedModels(next);
  };

  const handleToggleGroup = (providerId) => {
    const group = filteredGroups[providerId];
    if (!group) return;
    const allSelected = group.models.every((m) => selectedModels.has(m.value));
    const next = new Set(selectedModels);
    group.models.forEach((m) => {
      if (allSelected) next.delete(m.value);
      else next.add(m.value);
    });
    setSelectedModels(next);
  };

  const toggleCollapse = (providerId) => {
    const next = new Set(collapsedGroups);
    if (next.has(providerId)) next.delete(providerId);
    else next.add(providerId);
    setCollapsedGroups(next);
  };

  // Auto-expand all on search
  useEffect(() => {
    if (searchQuery.trim()) setCollapsedGroups(new Set());
  }, [searchQuery]);

  const handleConfirm = () => {
    const newModels = [...selectedModels].filter((v) => !addedModelValues.includes(v));
    onAdd(newModels);
    setIsOpen(false);
  };

  const selectedCount = [...selectedModels].filter((v) => !addedModelValues.includes(v)).length;

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      );
    }

    if (!dataReady) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      );
    }

    if (Object.keys(groupedModels).length === 0) {
      return (
        <div className="text-center py-10 text-text-muted">
          <span className="material-symbols-outlined text-3xl mb-2 block">layers</span>
          <p className="text-sm font-medium mb-1">No models found</p>
          <p className="text-xs">Connect providers first, or try another category.</p>
        </div>
      );
    }

    if (visibleProviderIds.length === 0) {
      return (
        <div className="text-center py-10 text-text-muted">
          <span className="material-symbols-outlined text-3xl mb-2 block">search_off</span>
          <p className="text-sm">No models match your search</p>
        </div>
      );
    }

    return (
      <>
        {/* Select All */}
        <label className="flex items-center gap-2 px-1 py-1.5 mb-1 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={handleToggleSelectAll}
            className="accent-primary size-3.5 cursor-pointer"
          />
          <span className="text-xs font-medium text-text-main">
            {allVisibleSelected ? "Deselect All" : `Select All (${totalVisibleModels} models)`}
          </span>
        </label>

        <div className="max-h-[360px] overflow-y-auto space-y-1 custom-scrollbar">
          {visibleProviderIds.map((providerId) => {
            const group = filteredGroups[providerId];
            const isCollapsed = collapsedGroups.has(providerId);
            const groupSelectedCount = group.models.filter((m) => selectedModels.has(m.value)).length;
            const groupAllSelected = groupSelectedCount === group.models.length;

            return (
              <div key={providerId} className="rounded-lg border border-border-subtle overflow-hidden">
                {/* Provider header */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-black/[0.02] dark:bg-white/[0.02]">
                  <button
                    onClick={() => toggleCollapse(providerId)}
                    className="p-0.5 rounded text-text-muted hover:text-primary transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {isCollapsed ? "chevron_right" : "expand_more"}
                    </span>
                  </button>
                  <input
                    type="checkbox"
                    checked={groupAllSelected}
                    onChange={() => handleToggleGroup(providerId)}
                    className="accent-primary size-3.5 cursor-pointer shrink-0"
                  />
                  <ProviderIcon
                    src={providerId === "__custom_models" ? "" : `/providers/${providerId}.png`}
                    alt={group.name}
                    size={14}
                    fallbackText={(group.name || providerId).slice(0, 2).toUpperCase()}
                    fallbackColor={group.color}
                  />
                  <span className="text-xs font-medium text-text-main truncate flex-1 min-w-0">
                    {group.name}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {groupAllSelected ? `☑ ${groupSelectedCount}/${group.models.length}` : `☐ ${groupSelectedCount}/${group.models.length}`}
                  </span>
                </div>

                {/* Models */}
                {!isCollapsed && (
                  <div className="px-2 py-1 space-y-0.5">
                    {group.models.map((model) => {
                      const isChecked = selectedModels.has(model.value);
                      return (
                        <label
                          key={model.value}
                          className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] group"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleModel(model.value)}
                            className="accent-primary size-3.5 cursor-pointer shrink-0"
                          />
                          <span className="text-xs font-mono text-text-main truncate min-w-0 flex-1">
                            {model.name}
                          </span>
                          {model.isCustom && (
                            <span className="text-[9px] text-text-muted opacity-60 shrink-0">custom</span>
                          )}
                          <CapacityBadges caps={getCaps(model.value)} />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <>
      {/* Trigger button — red dashed, paired with "Add Model" */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full mt-1 py-2 border border-dashed border-red-400/50 rounded-lg text-xs text-red-500 font-medium hover:border-red-500 hover:bg-red-500/5 transition-colors flex items-center justify-center gap-1"
      >
        <span className="material-symbols-outlined text-[16px]">select_all</span>
        Batch Add
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Batch Add Models"
        size="lg"
        className="p-4!"
        footer={null}
      >
        {/* Search */}
        <div className="mb-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search model or provider..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 overflow-x-auto">
          {TAB_CONFIG.map((tab) => {
            const count = tabCounts[tab.key] || 0;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-primary text-white"
                    : "bg-surface text-text-muted border border-border hover:border-primary/30 hover:text-primary"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1 ${isActive ? "text-white/70" : "text-text-muted"}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {renderContent()}

        {/* Confirm button */}
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className={`w-full py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
              selectedCount > 0
                ? "bg-primary text-white hover:bg-primary-hover"
                : "bg-black/5 dark:bg-white/5 text-text-muted cursor-not-allowed"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add {selectedCount} Model{selectedCount !== 1 ? "s" : ""}
          </button>
        </div>
      </Modal>
    </>
  );
}

BatchModelSelectModal.propTypes = {
  onAdd: PropTypes.func.isRequired,
  addedModelValues: PropTypes.arrayOf(PropTypes.string),
  activeProviders: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
    }),
  ),
};