# CocoaPods 1.15 and 1.16 can intermittently raise
# `ArgumentError: pathname contains null byte` while resolving a local pod
# through pnpm's symlinked node_modules tree.  The visible path contains no
# null byte; the failure occurs inside `Pathname#realdirpath` during Xcode
# group construction (CocoaPods/CocoaPods#12798).
#
# Group layout only needs a lexical base path.  Avoid resolving the symlink
# here while retaining CocoaPods' validation and relative group semantics.
module CocoaPodsPathnameWorkaround
  def group_for_path_in_group(
    absolute_pathname,
    group,
    reflect_file_system_structure,
    base_path = nil
  )
    unless absolute_pathname.absolute?
      raise ArgumentError, "Paths must be absolute #{absolute_pathname}"
    end
    unless base_path.nil? || base_path.absolute?
      raise ArgumentError, "Paths must be absolute #{base_path}"
    end

    relative_base = base_path.nil? ? group.real_path : base_path.cleanpath
    relative_pathname = absolute_pathname.relative_path_from(relative_base)
    relative_dir = relative_pathname.dirname

    if reflect_file_system_structure
      path = relative_base
      relative_dir.each_filename do |name|
        break if name.to_s.downcase.include? ".lproj"
        next if name == "."

        path += name
        group =
          group.children.find { |child| child.display_name == name } ||
          group.new_group(name, path)
      end
      return group
    end

    group
  end
end

Pod::Project.prepend(CocoaPodsPathnameWorkaround)
