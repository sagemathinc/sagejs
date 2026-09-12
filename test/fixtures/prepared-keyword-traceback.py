import os
import traceback


def caller():
    frames = traceback.extract_stack(limit=2)
    assert len(frames) == 2
    assert not any(
        frame.name
        in (
            "_internal_bind_kwargs",
            "ρσ_interpolate_kwargs",
            "ρσ_invoke_prepared_keywords",
            "ρσ_invoke_prepared_method",
        )
        for frame in frames
    )
    if os.environ.get("SAGEJS_RAW_STACK_ORACLE") != "1":
        assert [frame.name for frame in frames] == ["<module>", "caller"]
        assert all(
            frame.filename.endswith("prepared-keyword-traceback.py") for frame in frames
        )


caller()
print("prepared-keyword-traceback-ok")
