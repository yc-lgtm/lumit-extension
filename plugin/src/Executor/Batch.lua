return function(inst, runner)
	if type(inst.steps) ~= "table" then
		return { success = false, error = "batch.steps must be an array" }
	end

	for _, step in ipairs(inst.steps) do
		local result = runner(step)
		if not result.success then
			return result
		end
	end

	return { success = true }
end
