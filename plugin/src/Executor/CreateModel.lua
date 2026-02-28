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

	local model = Instance.new("Model")
	model.Name = inst.name or "Model"
	model.Parent = parent
	return { success = true, path = PathResolver.pathOf(model) }
end
