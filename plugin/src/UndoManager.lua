local ChangeHistoryService = game:GetService("ChangeHistoryService")

local UndoManager = {}

function UndoManager.beginAction(label)
	ChangeHistoryService:SetWaypoint(label or "lumit_action")
end

function UndoManager.commitAction(label)
	ChangeHistoryService:SetWaypoint((label or "lumit_action") .. "_done")
end

return UndoManager
