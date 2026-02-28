local PathResolver = require(script.Parent.Parent.PathResolver)

return function(inst)
	local parent = workspace
	if inst.parent and inst.parent ~= "Workspace" then
		local resolved, err = PathResolver.resolve(inst.parent)
		if not resolved then
			return { success = false, error = err }
		end
		parent = resolved
	end

	local scriptType = inst.scriptType or "Script"
	local obj
	if scriptType == "LocalScript" then
		obj = Instance.new("LocalScript")
	elseif scriptType == "ModuleScript" then
		obj = Instance.new("ModuleScript")
	else
		obj = Instance.new("Script")
	end

	obj.Name = inst.name or scriptType
	obj.Source = inst.source or "-- Lumit generated script\n"
	obj.Parent = parent
	return { success = true, path = PathResolver.pathOf(obj) }
end
