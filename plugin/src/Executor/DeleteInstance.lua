local PathResolver = require(script.Parent.Parent.PathResolver)

return function(inst)
	local target, err = PathResolver.resolve(inst.path)
	if not target then
		return { success = false, error = err }
	end

	target:Destroy()
	return { success = true, path = inst.path }
end
