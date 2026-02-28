local UndoManager = require(script.Parent.Parent.UndoManager)

local createPart = require(script.CreatePart)
local createModel = require(script.CreateModel)
local createScript = require(script.CreateScript)
local createFolder = require(script.CreateFolder)
local createTerrain = require(script.CreateTerrain)
local modifyProperty = require(script.ModifyProperty)
local deleteInstance = require(script.DeleteInstance)
local batch = require(script.Batch)

local Executor = {}

local handlers = {
	create_part = createPart,
	create_model = createModel,
	create_script = createScript,
	create_folder = createFolder,
	create_terrain = createTerrain,
	modify_property = modifyProperty,
	delete_instance = deleteInstance,
}

function Executor.run(inst)
	if type(inst) ~= "table" then
		return { success = false, error = "Instruction must be a table" }
	end

	if inst.type == "batch" then
		local ok, result = pcall(function()
			return batch(inst, Executor.run)
		end)
		if not ok then
			return { success = false, error = tostring(result) }
		end
		return result
	end

	local handler = handlers[inst.type]
	if not handler then
		return { success = false, error = "Unknown instruction type: " .. tostring(inst.type) }
	end

	UndoManager.beginAction(inst.type)
	local ok, result = pcall(handler, inst)
	UndoManager.commitAction(inst.type)

	if not ok then
		return { success = false, error = tostring(result) }
	end

	if type(result) ~= "table" then
		return { success = false, error = "Handler returned invalid result" }
	end

	return result
end

return Executor
